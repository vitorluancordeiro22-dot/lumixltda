"""Regressões offline: nenhuma conexão com MongoDB ou URL publicada.

Instale mongomock==4.3.0 além das dependências do backend e execute:
PYTHONPATH=backend python -m unittest discover -s backend/unit_tests -v
"""
import asyncio
from copy import deepcopy
import os
import sys
import unittest
from uuid import uuid4
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mongomock
from fastapi.testclient import TestClient
from stock import (calculate_recipe_requirements, product_requirements,
                   consume_requirements, restore_usages, batch_usages, stock_audit)


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def sort(self, *args):
        self.cursor = self.cursor.sort(*args)
        return self

    async def to_list(self, limit):
        return list(self.cursor) if limit is None else list(self.cursor.limit(limit))


class Collection:
    def __init__(self, db, name):
        self.db, self.name = db, name

    @property
    def sync(self):
        return self.db.store[self.name]

    def find(self, *args, **kwargs):
        return Cursor(self.sync.find(*args, **kwargs))

    def aggregate(self, *args, **kwargs):
        return Cursor(self.sync.aggregate(*args, **kwargs))

    def __getattr__(self, method):
        async def call(*args, **kwargs):
            await asyncio.sleep(0)  # permite testar requisições concorrentes
            if method.startswith(('insert', 'update', 'delete', 'replace')):
                self.db.writes += 1
                failure = self.db.failures.pop((self.name, method), None)
                if failure:
                    raise failure
            return getattr(self.sync, method)(*args, **kwargs)
        return call


class MemoryDB:
    def __init__(self):
        self.reset()

    def reset(self):
        self.store = mongomock.MongoClient()['stock_tests']
        self.writes = 0
        self.failures = {}

    def __getattr__(self, name):
        return Collection(self, name)

    __getitem__ = __getattr__


DB = MemoryDB()
# Substituir o driver ANTES de importar a aplicação. Até uma tentativa
# acidental de conexão real é impedida, independentemente do ambiente.
with patch.dict(os.environ, {'MONGO_URL': 'mongodb://offline.invalid', 'DB_NAME': 'offline', 'JWT_SECRET': 'offline-tests-only'}), \
     patch('motor.motor_asyncio.AsyncIOMotorClient') as fake_client, \
     patch('motor.motor_asyncio.AsyncIOMotorGridFSBucket'):
    fake_client.return_value.__getitem__.return_value = DB
    import server


USER = {'id': 'lab', 'name': 'Teste offline', 'email': 'laboratoriolumix@outlook.com'}


def fixture(db=DB):
    db.reset()
    db.store.raw_materials.insert_one({'id': 'base', 'name': 'Base LRC', 'type': 'Kg', 'total_stock': 10.0,
                                      'deleted': False, 'supplier_id': '', 'received_date': '', 'created_at': '2026-10-01'})
    db.store.raw_material_batches.insert_one({'id': 'input', 'raw_material_id': 'base', 'batch_number': '2610001',
        'date': '2026-10-01', 'quantity': 10.0, 'status': 'em_aberto', 'created_at': '2026-10-01', 'deleted': False})
    db.store.products.insert_one({'id': 'soap', 'name': 'Sabonete', 'unit': 'Litros', 'expected_liters': 200.0,
        'recipes': [{'raw_material_id': 'base', 'quantity_per_liter': 9.0, 'unit': 'Kg'}],
        'created_at': '2026-10-01', 'deleted': False})


class FormulaTests(unittest.TestCase):
    def test_recipe_is_total_for_its_yield(self):
        product = {'expected_liters': 200, 'recipes': [{'raw_material_id': 'x', 'quantity_per_liter': 9, 'unit': 'Kg'}]}
        self.assertEqual(calculate_recipe_requirements(product, 100)[0]['quantity'], 4.5)

    def test_duplicate_rows_and_grams_are_combined(self):
        product = {'expected_liters': 100, 'recipes': [
            {'raw_material_id': 'x', 'quantity_per_liter': 1, 'unit': 'Kg'},
            {'raw_material_id': 'x', 'quantity_per_liter': 500, 'unit': 'g'}]}
        self.assertEqual(calculate_recipe_requirements(product, 200)[0]['quantity'], 3)

    def test_bad_numbers_and_yields_are_rejected(self):
        for value in [0, -1, float('nan'), float('inf'), 0.00000001]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                calculate_recipe_requirements({'expected_liters': value, 'recipes': []}, 10)


class AllocationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = MemoryDB()
        fixture(self.db)

    async def test_shortage_of_second_material_changes_nothing(self):
        self.db.store.raw_materials.insert_one({'id': 'salt', 'type': 'Kg', 'name': 'Sal', 'total_stock': 0, 'deleted': False})
        before = deepcopy(list(self.db.store.raw_material_batches.find()))
        with self.assertRaisesRegex(ValueError, 'insuficiente'):
            await consume_requirements(self.db, [{'raw_material_id': 'base', 'quantity': 2, 'unit': 'Kg'},
                                                 {'raw_material_id': 'salt', 'quantity': 1, 'unit': 'Kg'}])
        self.assertEqual(list(self.db.store.raw_material_batches.find()), before)
        self.assertEqual(self.db.writes, 0)

    async def test_lifo_spans_more_than_one_hundred_batches(self):
        self.db.store.raw_material_batches.delete_many({})
        self.db.store.raw_material_batches.insert_many([
            {'id': str(i), 'raw_material_id': 'base', 'batch_number': str(i), 'quantity': 1,
             'date': '2026-10-01', 'created_at': str(i), 'status': 'em_aberto', 'deleted': False}
            for i in range(105)])
        self.db.store.raw_materials.update_one({'id': 'base'}, {'$set': {'total_stock': 105}})
        usage = await consume_requirements(self.db, [{'raw_material_id': 'base', 'quantity': 104.5, 'unit': 'Kg'}])
        self.assertEqual(len(usage[0]['batches_consumed']), 105)
        self.assertEqual(self.db.store.raw_materials.find_one({'id': 'base'})['total_stock'], 0.5)

    async def test_competing_consumers_do_not_overspend(self):
        request = [{'raw_material_id': 'base', 'quantity': 8, 'unit': 'Kg'}]
        results = await asyncio.gather(consume_requirements(self.db, request), consume_requirements(self.db, request), return_exceptions=True)
        self.assertEqual(sum(not isinstance(r, Exception) for r in results), 1)
        self.assertEqual(self.db.store.raw_material_batches.find_one({'id': 'input'})['quantity'], 2)
        self.assertEqual(self.db.store.raw_materials.find_one({'id': 'base'})['total_stock'], 2)

    async def test_failed_summary_write_returns_allocations(self):
        self.db.failures[('raw_materials', 'update_one')] = RuntimeError('simulated write failure')
        with self.assertRaises(RuntimeError):
            await consume_requirements(self.db, [{'raw_material_id': 'base', 'quantity': 3, 'unit': 'Kg'}])
        self.assertEqual(self.db.store.raw_material_batches.find_one({'id': 'input'})['quantity'], 10)
        self.assertEqual(self.db.store.raw_materials.find_one({'id': 'base'})['total_stock'], 10)

    async def test_decimal_receipts_can_be_consumed_to_zero(self):
        self.db.store.raw_material_batches.update_one({'id': 'input'}, {'$set': {'quantity': 0.3}})
        self.db.store.raw_materials.update_one({'id': 'base'}, {'$set': {'total_stock': 0.3}})
        for amount in [0.1, 0.2]:
            await consume_requirements(self.db, [{'raw_material_id': 'base', 'quantity': amount, 'unit': 'Kg'}])
        self.assertEqual(self.db.store.raw_material_batches.find_one({'id': 'input'})['quantity'], 0)
        self.assertAlmostEqual(self.db.store.raw_materials.find_one({'id': 'base'})['total_stock'], 0)

    async def test_ml_scale_to_liters_even_with_legacy_stock_label(self):
        product = {'expected_liters': 100, 'recipes': [{'raw_material_id': 'base', 'quantity_per_liter': 250, 'unit': 'ml'}]}
        self.db.store.raw_materials.update_one({'id': 'base'}, {'$set': {'type': 'Litros'}})
        rows = await product_requirements(self.db, product, 200)
        self.assertEqual(rows[0]['quantity'], 0.5)
        self.db.store.raw_materials.update_one({'id': 'base'}, {'$set': {'type': 'Kg'}})
        rows = await product_requirements(self.db, product, 200)
        self.assertEqual(rows[0]['quantity'], 0.5)
        self.assertEqual(rows[0]['unit'], 'Litros')
        self.assertEqual(rows[0]['stock_quantity_basis'], 'recipe')
        self.assertEqual(rows[0]['stock_unit_label'], 'Kg')

    async def test_recipe_weight_is_authoritative_over_legacy_liter_label(self):
        self.db.store.raw_materials.update_one({'id': 'base'}, {'$set': {'type': 'Litros'}})
        product = {'unit': 'Litros', 'expected_liters': 150,
                   'recipes': [{'raw_material_id': 'base', 'quantity_per_liter': 0.3, 'unit': 'Kg'}]}
        for planned, expected in [(75, 0.15), (150, 0.3), (300, 0.6), (450, 0.9)]:
            rows = await product_requirements(self.db, product, planned)
            self.assertEqual(rows[0]['quantity'], expected)
            self.assertEqual(rows[0]['unit'], 'Kg')
        self.assertEqual(self.db.writes, 0)
        self.assertEqual(self.db.store.raw_materials.find_one({'id': 'base'})['type'], 'Litros')

    async def test_grams_keep_their_scale_when_stock_label_is_liters(self):
        self.db.store.raw_materials.update_one({'id': 'base'}, {'$set': {'type': 'Litros'}})
        product = {'expected_liters': 150,
                   'recipes': [{'raw_material_id': 'base', 'quantity_per_liter': 300, 'unit': 'g'}]}
        rows = await product_requirements(self.db, product, 300)
        self.assertEqual(rows[0]['quantity'], 0.6)
        self.assertEqual(rows[0]['unit'], 'Kg')

    async def test_return_to_archived_lot_preserves_history(self):
        usage = await consume_requirements(self.db, [{'raw_material_id': 'base', 'quantity': 10, 'unit': 'Kg'}])
        archived = self.db.store.raw_material_batches.find_one({'id': 'input'})
        archived['status'] = 'finalizado'
        self.db.store.archived_raw_material_batches.insert_one(archived)
        self.db.store.raw_material_batches.delete_one({'id': 'input'})
        await restore_usages(self.db, usage)
        self.assertEqual(self.db.store.raw_material_batches.find_one({'id': 'input'})['quantity'], 10)
        self.assertEqual(self.db.store.archived_raw_material_batches.find_one({'id': 'input'})['quantity'], 0)

    async def test_audit_never_rewrites_four_thousand(self):
        self.db.store.raw_materials.update_one({'id': 'base'}, {'$set': {'total_stock': 4000}})
        writes = self.db.writes
        report = await stock_audit(self.db)
        self.assertTrue(report['read_only'])
        self.assertEqual(report['materials'][0]['difference'], 3990)
        self.assertEqual(self.db.writes, writes)
        self.assertEqual(self.db.store.raw_materials.find_one({'id': 'base'})['total_stock'], 4000)

    async def test_two_cancellations_return_stock_once(self):
        fixture(DB)
        batch = await server.create_product_batch(server.ProductBatchCreate(
            product_id='soap', date='2026-10-27', unit='Litros', planned_liters=100), USER)
        results = await asyncio.gather(server.delete_product_batch(batch.id, USER),
                                       server.delete_product_batch(batch.id, USER), return_exceptions=True)
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertEqual(DB.store.raw_materials.find_one({'id': 'base'})['total_stock'], 10)

    async def test_legacy_usage_formats_keep_all_allocations(self):
        merged = batch_usages({'raw_materials_used': [
            {'raw_material_id': 'x', 'quantity_needed': 2, 'batches_consumed': [{'batch_id': 'a', 'quantity_used': 2}]},
            {'raw_material_id': 'x', 'quantity_needed': 3, 'batches_consumed': [{'batch_id': 'b', 'quantity_used': 3}]},
        ]})
        self.assertEqual(merged[0]['quantity_needed'], 5)
        self.assertEqual(len(merged[0]['batches_consumed']), 2)
        legacy = batch_usages({'materials_used': [{'raw_material_id': 'x', 'quantity': 4,
            'allocations': [{'batch_id': 'a', 'quantity': 4}]}]})
        self.assertEqual(legacy[0]['batches_consumed'][0]['quantity_used'], 4)

    async def test_concurrent_releases_keep_first_responsible_user(self):
        fixture(DB)
        batch = await server.create_product_batch(server.ProductBatchCreate(
            product_id='soap', date='2026-10-27', unit='Litros', planned_liters=100), USER)
        results = await asyncio.gather(
            server.mark_ready_for_bottling(batch.id, {'id': 'a', 'email': 'operador-a@example.test'}),
            server.mark_ready_for_bottling(batch.id, {'id': 'b', 'email': 'operador-b@example.test'}),
            return_exceptions=True,
        )
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        document = DB.store.product_batches.find_one({'id': batch.id})
        self.assertEqual(document['status'], 'em_aberto')
        self.assertIn(document['released_by'], ['operador-a@example.test', 'operador-b@example.test'])
        self.assertEqual(DB.store.raw_materials.find_one({'id': 'base'})['total_stock'], 5.5)


class RouteTests(unittest.TestCase):
    def setUp(self):
        fixture()
        server.app.dependency_overrides[server.get_current_user] = lambda: USER
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        server.app.dependency_overrides.clear()

    def stock(self):
        return DB.store.raw_materials.find_one({'id': 'base'})['total_stock']

    def make_product_batch(self, size=100):
        response = self.client.post('/api/product-batches', json={'product_id': 'soap', 'date': '2026-10-27',
            'unit': 'Litros', 'planned_liters': size})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_actual_flor_de_ameixa_recipe_doubles_all_five_ingredients(self):
        ingredients = [('preservative', 0.3, 0.6), ('brancol', 0.25, 0.5),
                       ('essence', 0.3, 0.6), ('renex', 0.3, 0.6), ('water', 148, 296)]
        recipes = []
        for material_id, amount, expected in ingredients:
            DB.store.raw_materials.insert_one({'id': material_id, 'name': material_id, 'type': 'Litros',
                'total_stock': 1000, 'deleted': False})
            DB.store.raw_material_batches.insert_one({'id': 'lot-' + material_id, 'raw_material_id': material_id,
                'batch_number': material_id, 'quantity': 1000, 'status': 'em_aberto', 'deleted': False})
            recipes.append({'raw_material_id': material_id, 'quantity_per_liter': amount, 'unit': 'Kg'})
        DB.store.products.update_one({'id': 'soap'}, {'$set': {'name': 'Limpador Flor de Ameixa',
            'expected_liters': 150, 'recipes': recipes}})
        batch = self.make_product_batch(300)
        usages = {row['raw_material_id']: row for row in batch['raw_materials_used']}
        for material_id, amount, expected in ingredients:
            self.assertEqual(usages[material_id]['quantity_needed'], expected)
            self.assertEqual(usages[material_id]['unit'], 'Kg')
            self.assertEqual(usages[material_id]['stock_unit_label'], 'Litros')
            self.assertEqual(DB.store.raw_materials.find_one({'id': material_id})['total_stock'], 1000 - expected)
            self.assertEqual(DB.store.raw_material_batches.find_one({'id': 'lot-' + material_id})['quantity'], 1000 - expected)
        response = self.client.post('/api/production-orders', json={'product_id': 'soap', 'product_batch_id': batch['id'],
            'date': '2026-10-27', 'weigher': 'Teste', 'production_size': 300, 'materials_used': []})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(DB.store.raw_materials.find_one({'id': 'water'})['total_stock'], 704)
        self.assertEqual(self.client.delete('/api/product-batches/' + batch['id']).status_code, 200)
        self.assertEqual(DB.store.raw_materials.find_one({'id': 'water'})['total_stock'], 1000)

    def test_legacy_unit_label_keeps_resize_and_cancellation_exact(self):
        DB.store.raw_materials.update_one({'id': 'base'}, {'$set': {'type': 'Litros'}})
        batch = self.make_product_batch(100)
        self.assertEqual(self.stock(), 5.5)
        response = self.client.put('/api/product-batches/' + batch['id'], json={'planned_liters': 200})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stock(), 1)
        self.assertEqual(self.client.delete('/api/product-batches/' + batch['id']).status_code, 200)
        self.assertEqual(self.stock(), 10)

    def test_receipt_then_production_then_order_debits_only_once(self):
        response = self.client.post('/api/raw-material-batches', json={'raw_material_id': 'base', 'date': '2026-10-27', 'quantity': 20})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stock(), 30)
        batch = self.make_product_batch(200)
        self.assertEqual(self.stock(), 21)
        response = self.client.post('/api/production-orders', json={'product_id': 'soap', 'product_batch_id': batch['id'],
            'date': '2026-10-27', 'weigher': 'Teste', 'production_size': 200,
            'materials_used': [{'raw_material_id': 'base', 'quantity': 4000}]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['materials_used'][0]['quantity'], 9)
        self.assertEqual(self.stock(), 21)

    def test_metadata_edit_cannot_restore_old_cached_total(self):
        self.make_product_batch()
        response = self.client.put('/api/raw-materials/base', json={'name': 'Nome atualizado', 'type': 'Kg', 'total_stock': 4000})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stock(), 5.5)

    def test_delete_repeatedly_never_returns_twice_and_restore_debits(self):
        batch = self.make_product_batch()
        url = '/api/product-batches/' + batch['id']
        self.assertEqual(self.client.delete(url).status_code, 200)
        self.assertEqual(self.stock(), 10)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertEqual(self.stock(), 10)
        trash = DB.store.trash.find_one({'item_type': 'product_batch'})
        self.assertEqual(self.client.post('/api/trash/restore/' + trash['id']).status_code, 200)
        self.assertEqual(self.stock(), 5.5)
        self.assertEqual(self.client.post('/api/trash/restore/' + trash['id']).status_code, 404)
        self.assertEqual(self.stock(), 5.5)

    def test_resize_up_down_and_repeat_changes_only_difference(self):
        batch = self.make_product_batch()
        url = '/api/product-batches/' + batch['id']
        for size, expected in [(200, 1), (200, 1), (50, 7.75), (100, 5.5)]:
            response = self.client.put(url, json={'planned_liters': size})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(self.stock(), expected)
            self.assertEqual(DB.store.raw_material_batches.find_one({'id': 'input'})['quantity'], expected)

    def test_insufficient_resize_preserves_previous_usage(self):
        batch = self.make_product_batch()
        response = self.client.put('/api/product-batches/' + batch['id'], json={'planned_liters': 1000})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.stock(), 5.5)
        self.assertEqual(DB.store.product_batches.find_one({'id': batch['id']})['planned_liters'], 100)

    def test_failed_product_insert_rolls_back_stock(self):
        DB.failures[('product_batches', 'insert_one')] = RuntimeError('simulated insert failure')
        with self.assertRaises(RuntimeError):
            self.client.post('/api/product-batches', json={'product_id': 'soap', 'date': '2026-10-27', 'unit': 'Litros', 'planned_liters': 100})
        self.assertEqual(self.stock(), 10)
        self.assertEqual(DB.store.raw_material_batches.find_one({'id': 'input'})['quantity'], 10)

    def test_raw_lot_delete_and_restore_move_only_remaining_stock(self):
        self.make_product_batch()
        self.assertEqual(self.client.delete('/api/raw-material-batches/input').status_code, 200)
        self.assertEqual(self.stock(), 0)
        self.assertEqual(self.client.delete('/api/raw-material-batches/input').status_code, 404)
        trash = DB.store.trash.find_one({'item_type': 'raw_material_batch'})
        self.assertEqual(self.client.post('/api/trash/restore/' + trash['id']).status_code, 200)
        self.assertEqual(self.stock(), 5.5)

    def test_raw_lot_edit_adds_only_delta(self):
        for amount, expected in [(12, 12), (12, 12), (3, 3)]:
            response = self.client.put('/api/raw-material-batches/input', json={'quantity': amount})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(self.stock(), expected)

    def test_finalizing_remaining_lot_records_writeoff_and_cannot_repeat(self):
        self.make_product_batch()
        self.assertEqual(self.client.post('/api/raw-material-batches/input/finalize').status_code, 200)
        self.assertEqual(self.stock(), 0)
        lot = DB.store.raw_material_batches.find_one({'id': 'input'})
        self.assertEqual(lot['closed_remaining_quantity'], 5.5)
        self.assertEqual(lot['quantity'], 0)
        self.assertEqual(self.client.post('/api/raw-material-batches/input/finalize').status_code, 400)
        self.assertEqual(self.stock(), 0)

    def test_invalid_quantities_and_opening_balance_are_rejected(self):
        for amount in [0, -9]:
            response = self.client.post('/api/raw-material-batches', json={'raw_material_id': 'base', 'date': '2026-10-27', 'quantity': amount})
            self.assertEqual(response.status_code, 422)
        response = self.client.post('/api/raw-materials', json={'name': 'Nova', 'type': 'Kg', 'total_stock': 4000})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.stock(), 10)

    def test_legacy_recalculate_endpoint_is_read_only(self):
        DB.store.raw_materials.update_one({'id': 'base'}, {'$set': {'total_stock': 4000}})
        writes = DB.writes
        response = self.client.post('/api/raw-materials/recalculate-stock')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['read_only'])
        self.assertEqual(DB.writes, writes)
        self.assertEqual(self.stock(), 4000)

    def test_received_purchase_order_cannot_be_credited_twice(self):
        DB.store.purchase_orders.insert_one({'id': 'order', 'deleted': False, 'batched': False})
        payload = {'date': '2026-10-27', 'entries': [{'raw_material_id': 'base', 'quantity': 3}]}
        url = '/api/purchase-orders/order/generate-batches'
        self.assertEqual(self.client.post(url, json=payload).status_code, 200)
        self.assertEqual(self.stock(), 13)
        self.assertEqual(self.client.post(url, json=payload).status_code, 409)
        self.assertEqual(self.stock(), 13)

    def test_industrial_op_uses_proportional_consumption(self):
        DB.store.products.update_one({'id': 'soap'}, {'$set': {'file_models': {'op_model': {
            'file_id': 'offline', 'filename': 'op.xls', 'content_type': 'application/vnd.ms-excel', 'size': 1,
            'file_type': 'op_model', 'version': 1, 'uploaded_at': '2026-10-01', 'uploaded_by': 'lab'}}}})
        response = self.client.post('/api/industrial-ops', json={'product_id': 'soap', 'planned_quantity': 100,
            'unit': 'Litros', 'responsible_name': 'Teste offline'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['raw_materials'][0]['quantity_used'], 4.5)
        self.assertEqual(self.stock(), 5.5)

    def test_deleting_a_produced_batch_does_not_fabricate_raw_stock(self):
        batch = self.make_product_batch()
        DB.store.product_batches.update_one({'id': batch['id']}, {'$set': {'total_bottled': 100}})
        self.assertEqual(self.client.delete('/api/product-batches/' + batch['id']).status_code, 409)
        self.assertEqual(self.stock(), 5.5)

    def test_finalizing_and_reopening_product_never_debits_again(self):
        batch = self.make_product_batch()
        url = '/api/product-batches/' + batch['id']
        self.assertEqual(self.client.post(url + '/finalize').status_code, 200)
        self.assertEqual(self.client.post(url + '/reopen').status_code, 200)
        self.assertEqual(self.stock(), 5.5)

    def test_large_cached_balance_cannot_hide_insufficient_lots(self):
        DB.store.raw_materials.update_one({'id': 'base'}, {'$set': {'total_stock': 4000}})
        response = self.client.post('/api/product-batches', json={'product_id': 'soap', 'date': '2026-10-27',
            'unit': 'Litros', 'planned_liters': 1000})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.stock(), 4000)
        self.assertEqual(DB.store.product_batches.count_documents({}), 0)

    def test_failed_receipt_does_not_leave_phantom_lot(self):
        DB.failures[('raw_materials', 'update_one')] = RuntimeError('simulated write failure')
        with self.assertRaises(RuntimeError):
            self.client.post('/api/raw-material-batches', json={'raw_material_id': 'base', 'date': '2026-10-27', 'quantity': 20})
        self.assertEqual(self.stock(), 10)
        self.assertEqual(DB.store.raw_material_batches.count_documents({}), 1)

    def test_users_outside_original_email_list_can_release(self):
        for role in ['producao', 'pedidos', 'outro']:
            with self.subTest(role=role):
                fixture()
                server.app.dependency_overrides[server.get_current_user] = lambda: USER
                batch = self.make_product_batch()
                account = {'id': role, 'name': 'Operador offline', 'email': role + '@example.test', 'role': role}
                DB.store.users.insert_one(account)
                # Testar autenticação JWT real, sem substituir a dependência.
                server.app.dependency_overrides.clear()
                response = self.client.post('/api/product-batches/' + batch['id'] + '/ready-for-bottling',
                    headers={'Authorization': 'Bearer ' + server.create_token(role)})
                self.assertEqual(response.status_code, 200, response.text)
                document = DB.store.product_batches.find_one({'id': batch['id']})
                self.assertEqual(document['status'], 'em_aberto')
                self.assertEqual(document['released_by'], account['email'])
                self.assertTrue(document['released_for_bottling_at'])
                self.assertEqual(self.stock(), 5.5)

    def test_anonymous_release_stays_blocked(self):
        batch = self.make_product_batch()
        server.app.dependency_overrides.clear()
        response = self.client.post('/api/product-batches/' + batch['id'] + '/ready-for-bottling')
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(DB.store.product_batches.find_one({'id': batch['id']})['status'], 'em_producao')
        self.assertEqual(self.stock(), 5.5)


class PhysicalCountTests(unittest.TestCase):
    stock = RouteTests.stock
    make_product_batch = RouteTests.make_product_batch

    def setUp(self):
        fixture()
        server.app.dependency_overrides[server.get_current_user] = lambda: USER
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        server.app.dependency_overrides.clear()

    def prepare(self, amount):
        response = self.client.post('/api/raw-materials/base/physical-count/preview', json={'counted_stock': amount})
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        return data, {'counted_stock': amount, 'reason': 'Contagem física offline',
            'expected_version': data['expected_version'], 'request_id': str(uuid4()), 'confirmed': True,
            'lot_counts': [{'batch_id': row['batch_id'], 'quantity': row['after']} for row in data['lot_changes']]}

    def confirm(self, payload):
        return self.client.post('/api/raw-materials/base/physical-count', json=payload)

    def test_preview_is_read_only_even_for_four_thousand(self):
        DB.store.raw_materials.update_one({'id': 'base'}, {'$set': {'total_stock': 4000}})
        before = deepcopy(list(DB.store.raw_material_batches.find()))
        writes = DB.writes
        preview, _ = self.prepare(100)
        self.assertEqual(preview['before_total'], 4000)
        self.assertEqual(preview['unassigned_quantity'], 90)
        self.assertTrue(preview['read_only'])
        self.assertEqual(DB.writes, writes)
        self.assertEqual(self.stock(), 4000)
        self.assertEqual(list(DB.store.raw_material_batches.find()), before)

    def test_physical_count_aligns_total_and_lots_and_preserves_history(self):
        DB.store.raw_materials.update_one({'id': 'base'}, {'$set': {'total_stock': 4000}})
        DB.store.raw_material_batches.update_one({'id': 'input'}, {'$set': {'quantity': 100}})
        _, payload = self.prepare(50)
        response = self.confirm(payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stock(), 50)
        self.assertEqual(DB.store.raw_material_batches.find_one({'id': 'input'})['quantity'], 50)
        journal = DB.store.stock_counts.find_one({'id': payload['request_id']})
        self.assertEqual(journal['before_total'], 4000)
        self.assertEqual(journal['before_batches'][0]['quantity'], 100)
        self.assertEqual(journal['created_by_email'], USER['email'])
        self.assertEqual(journal['status'], 'applied')
        self.assertEqual(DB.store.products.count_documents({}), 1)
        self.assertEqual(DB.store.raw_materials.find_one({'id': 'base'})['name'], 'Base LRC')

    def test_count_then_receipt_then_production_follows_real_baseline(self):
        _, payload = self.prepare(100)
        self.assertEqual(self.confirm(payload).status_code, 200)
        receipt = self.client.post('/api/raw-material-batches', json={'raw_material_id': 'base', 'date': '2026-10-27', 'quantity': 50})
        self.assertEqual(receipt.status_code, 200, receipt.text)
        self.assertEqual(self.stock(), 150)
        self.make_product_batch(200)
        self.assertEqual(self.stock(), 141)
        balance = sum(b['quantity'] for b in DB.store.raw_material_batches.find({'status': 'em_aberto', 'deleted': False}))
        self.assertEqual(balance, 141)

    def test_duplicate_confirmation_is_idempotent(self):
        _, payload = self.prepare(100)
        first = self.confirm(payload)
        second = self.confirm(payload)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json()['id'], second.json()['id'])
        self.assertEqual(self.stock(), 100)
        self.assertEqual(DB.store.stock_counts.count_documents({}), 1)
        self.assertEqual(DB.store.raw_material_batches.count_documents({'is_inventory_adjustment': True}), 1)

    def test_stale_preview_rejects_instead_of_overwriting_new_receipt(self):
        _, payload = self.prepare(100)
        receipt = self.client.post('/api/raw-material-batches', json={'raw_material_id': 'base', 'date': '2026-10-27', 'quantity': 20})
        self.assertEqual(receipt.status_code, 200)
        response = self.confirm(payload)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.stock(), 30)
        self.assertEqual(DB.store.stock_counts.count_documents({}), 0)

    def test_zero_count_closes_available_lots_without_deleting_them(self):
        _, payload = self.prepare(0)
        self.assertEqual(self.confirm(payload).status_code, 200)
        self.assertEqual(self.stock(), 0)
        lot = DB.store.raw_material_batches.find_one({'id': 'input'})
        self.assertEqual(lot['quantity'], 0)
        self.assertEqual(lot['status'], 'finalizado')
        self.assertFalse(lot['deleted'])

    def test_operator_can_choose_physical_distribution_per_lot(self):
        DB.store.raw_material_batches.insert_one({'id': 'other', 'raw_material_id': 'base', 'batch_number': '2610002',
            'date': '2026-10-20', 'quantity': 4, 'status': 'em_aberto', 'created_at': '2026-10-20', 'deleted': False})
        _, payload = self.prepare(5)
        payload['lot_counts'] = [{'batch_id': 'input', 'quantity': 2}, {'batch_id': 'other', 'quantity': 3}]
        response = self.confirm(payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(DB.store.raw_material_batches.find_one({'id': 'input'})['quantity'], 2)
        self.assertEqual(DB.store.raw_material_batches.find_one({'id': 'other'})['quantity'], 3)
        self.assertEqual(self.stock(), 5)

    def test_invalid_distribution_does_not_write_count_or_stock(self):
        _, payload = self.prepare(5)
        payload['lot_counts'][0]['quantity'] = 6
        response = self.confirm(payload)
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.stock(), 10)
        self.assertEqual(DB.store.stock_counts.count_documents({}), 0)

    def test_count_requires_explicit_confirmation(self):
        _, payload = self.prepare(5)
        payload['confirmed'] = False
        self.assertEqual(self.confirm(payload).status_code, 400)
        self.assertEqual(self.stock(), 10)
        self.assertEqual(DB.store.stock_counts.count_documents({}), 0)

    def test_unauthorized_and_anonymous_users_cannot_count(self):
        _, payload = self.prepare(5)
        server.app.dependency_overrides[server.get_current_user] = lambda: {'id': 'operator', 'email': 'operator@example.test'}
        self.assertEqual(self.confirm(payload).status_code, 403)
        self.assertEqual(self.client.post('/api/raw-materials/base/physical-count/preview', json={'counted_stock': 5}).status_code, 403)
        server.app.dependency_overrides.clear()
        self.assertIn(self.confirm(payload).status_code, (401, 403))
        self.assertEqual(self.stock(), 10)

    def test_failed_count_restores_balances_and_keeps_audit(self):
        _, payload = self.prepare(5)
        DB.failures[('raw_materials', 'update_one')] = RuntimeError('simulated failure during count')
        with self.assertRaises(RuntimeError):
            self.confirm(payload)
        self.assertEqual(self.stock(), 10)
        self.assertEqual(DB.store.raw_material_batches.find_one({'id': 'input'})['quantity'], 10)
        self.assertEqual(DB.store.stock_counts.find_one({'id': payload['request_id']})['status'], 'failed')
        self.assertTrue(DB.store.stock_control.find_one({'_id': 'inventory'})['owner'])

    def test_old_cancellation_cannot_inflate_new_physical_balance(self):
        old_batch = self.make_product_batch()
        _, payload = self.prepare(5.5)
        self.assertEqual(self.confirm(payload).status_code, 200)
        response = self.client.delete('/api/product-batches/' + old_batch['id'])
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.stock(), 5.5)
        new_batch = self.make_product_batch()
        self.assertEqual(self.stock(), 1)
        self.assertEqual(self.client.delete('/api/product-batches/' + new_batch['id']).status_code, 200)
        self.assertEqual(self.stock(), 5.5)

    def test_old_trash_receipt_cannot_be_added_after_count(self):
        self.assertEqual(self.client.delete('/api/raw-material-batches/input').status_code, 200)
        trash = DB.store.trash.find_one({'item_type': 'raw_material_batch'})
        _, payload = self.prepare(0)
        self.assertEqual(self.confirm(payload).status_code, 200)
        response = self.client.post('/api/trash/restore/' + trash['id'])
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.stock(), 0)

    def test_adjustment_lot_does_not_reset_receipt_numbering(self):
        _, payload = self.prepare(100)
        self.assertEqual(self.confirm(payload).status_code, 200)
        response = self.client.get('/api/batches/next-number?date=2026-10-27')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['batch_number'], '2610002')

    def test_pending_operation_blocks_new_count_preview(self):
        _, payload = self.prepare(5)
        DB.store.stock_control.insert_one({'_id': 'inventory', 'owner': 'another-process', 'revision': 0})
        response = self.client.post('/api/raw-materials/base/physical-count/preview', json={'counted_stock': 5})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.confirm(payload).status_code, 409)
        self.assertEqual(self.stock(), 10)

    def test_count_can_establish_balance_when_old_total_has_no_lots(self):
        DB.store.raw_material_batches.delete_many({})
        DB.store.raw_materials.update_one({'id': 'base'}, {'$set': {'total_stock': 4000}})
        preview, payload = self.prepare(100)
        self.assertEqual(preview['lot_changes'], [])
        self.assertEqual(self.confirm(payload).status_code, 200)
        self.make_product_batch(200)
        self.assertEqual(self.stock(), 91)

    def test_receipt_after_count_can_be_deleted_and_restored(self):
        _, payload = self.prepare(100)
        self.assertEqual(self.confirm(payload).status_code, 200)
        receipt = self.client.post('/api/raw-material-batches', json={'raw_material_id': 'base', 'date': '2026-10-27', 'quantity': 3})
        self.assertEqual(receipt.status_code, 200)
        self.assertEqual(self.client.delete('/api/raw-material-batches/' + receipt.json()['id']).status_code, 200)
        self.assertEqual(self.stock(), 100)
        trash = DB.store.trash.find_one({'item_type': 'raw_material_batch'})
        self.assertEqual(self.client.post('/api/trash/restore/' + trash['id']).status_code, 200)
        self.assertEqual(self.stock(), 103)


if __name__ == '__main__':
    unittest.main()
