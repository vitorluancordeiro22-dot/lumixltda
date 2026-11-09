"""Estoque de produto acabado — testes offline (mongomock, sem banco real).

PYTHONPATH=backend python -m unittest backend.unit_tests.test_finished_stock -v
"""
import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mongomock
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from finished_stock import plan_exit, setup_finished_stock_routes, should_notify


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def sort(self, *args):
        self.cursor = self.cursor.sort(*args)
        return self

    async def to_list(self, limit):
        return list(self.cursor) if limit is None else list(self.cursor.limit(limit))


class Collection:
    def __init__(self, store, name):
        self.store, self.name = store, name

    def find(self, *args, **kwargs):
        return Cursor(self.store[self.name].find(*args, **kwargs))

    def __getattr__(self, method):
        async def call(*args, **kwargs):
            await asyncio.sleep(0)
            return getattr(self.store[self.name], method)(*args, **kwargs)
        return call


class MemoryDB:
    def __init__(self):
        self.store = mongomock.MongoClient()['finished_stock_tests']

    def __getattr__(self, name):
        return Collection(self.store, name)


USER = {'id': 'u1', 'name': 'Vitor', 'email': 'vitor@lumix.com'}


def build():
    db = MemoryDB()
    pushes = []

    async def fake_user():
        return USER

    async def fake_push(title, body, url='/notificar'):
        pushes.append(body)

    app, router = FastAPI(), APIRouter(prefix='/api')
    setup_finished_stock_routes(router, db, fake_user, fake_push)
    app.include_router(router)
    s = db.store
    s.products.insert_many([
        {'id': 'desinf', 'name': 'Desinfetante', 'unit': 'Litros', 'deleted': False,
         'stock_sizes': ['one_liter', 'five_liter'], 'stock_minimums': {'one_liter': 10}},
        {'id': 'sabao', 'name': 'Sabão em pó', 'unit': 'Kg', 'deleted': False},
        {'id': 'velho', 'name': 'Apagado', 'unit': 'Litros', 'deleted': True},
    ])
    # lote ativo: 80 garrafas de 1L contadas em duas contagens
    s.product_batches.insert_one({'id': 'b1', 'product_id': 'desinf', 'batch_number': '2611001',
                                  'date': '2026-11-02', 'status': 'finalizado', 'deleted': False})
    s.counting.insert_many([{'id': 'c1', 'product_batch_id': 'b1', 'one_liter': 50},
                            {'id': 'c2', 'product_batch_id': 'b1', 'one_liter': 30, 'five_liter': 4}])
    # lote arquivado mais antigo
    s.archived_product_batches.insert_one({'id': 'b0', 'product_id': 'desinf', 'batch_number': '2610050',
                                           'date': '2026-10-20', 'status': 'finalizado',
                                           'countings_history': [{'one_liter': 20}]})
    return TestClient(app), db, pushes


class PureRules(unittest.TestCase):
    def test_exit_takes_mixed_then_oldest_lot_first(self):
        lots = [{'id': 'new', 'batch_id': 'b2', 'batch_date': '2026-11-05', 'quantity': 5},
                {'id': 'old', 'batch_id': 'b1', 'batch_date': '2026-10-01', 'quantity': 3},
                {'id': 'mix', 'batch_id': None, 'batch_date': '', 'quantity': 2}]
        self.assertEqual([(a['lot_id'], a['quantity']) for a in plan_exit(lots, 6)],
                         [('mix', 2), ('old', 3), ('new', 1)])

    def test_exit_beyond_stock_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'insuficiente'):
            plan_exit([{'id': 'a', 'batch_id': 'b', 'quantity': 3}], 4)

    def test_notification_only_when_crossing_minimum(self):
        self.assertTrue(should_notify(35, 10, 10))
        self.assertFalse(should_notify(10, 8, 10))   # já estava no mínimo
        self.assertFalse(should_notify(35, 11, 10))
        self.assertFalse(should_notify(5, 0, 0))     # sem mínimo configurado


class StockFlow(unittest.TestCase):
    def setUp(self):
        self.client, self.db, self.pushes = build()

    def entry(self, **kw):
        body = {'product_id': 'desinf', 'size': 'one_liter', 'quantity': 1, 'batch_id': 'b1', 'operator': 'Vitor', **kw}
        return self.client.post('/api/finished-stock/entries', json=body)

    def total(self, product='desinf', size='one_liter'):
        data = self.client.get('/api/finished-stock/overview').json()
        prod = next(p for p in data['products'] if p['product_id'] == product)
        return next(s for s in prod['sizes'] if s['size'] == size)

    def test_example_from_production(self):
        # Vitor fez 80 garrafas; 45 foram direto ao depósito; 35 entram no estoque (mínimo 10)
        self.assertEqual(self.entry(quantity=35).status_code, 200)
        self.assertEqual(self.total()['quantity'], 35)
        self.assertFalse(self.total()['low'])
        # Vitor tira 25
        r = self.client.post('/api/finished-stock/exits', json={
            'items': [{'product_id': 'desinf', 'size': 'one_liter', 'quantity': 25}], 'operator': 'Vitor'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.total()['quantity'], 10)
        self.assertTrue(self.total()['low'])
        notes = list(self.db.store.notifications.find())
        self.assertEqual(len(notes), 1)
        self.assertIn('apenas 10 unidades', notes[0]['message'])
        self.assertIn('nova ordem de produção', notes[0]['message'])
        self.assertEqual(len(self.pushes), 1)

    def test_normal_entry_limited_by_counting(self):
        self.assertEqual(self.entry(quantity=60).status_code, 200)
        r = self.entry(quantity=21)
        self.assertEqual(r.status_code, 400)
        self.assertIn('Disponível: 20', r.json()['detail'])
        self.assertEqual(self.entry(quantity=20).status_code, 200)
        batches = self.client.get('/api/finished-stock/products/desinf/batches').json()
        b1 = next(b for b in batches if b['batch_id'] == 'b1')
        self.assertEqual(b1['sizes']['one_liter'], {'counted': 80, 'entered': 80, 'available': 0})
        self.assertEqual(b1['sizes']['five_liter']['available'], 4)

    def test_archived_batches_are_listed_and_usable(self):
        batches = self.client.get('/api/finished-stock/products/desinf/batches').json()
        self.assertEqual([b['batch_id'] for b in batches], ['b1', 'b0'])
        self.assertEqual(batches[1]['status'], 'arquivado')
        self.assertEqual(self.entry(batch_id='b0', quantity=20).status_code, 200)
        self.assertEqual(self.entry(batch_id='b0', quantity=1).status_code, 400)

    def test_inventory_mode_has_no_limit_and_optional_batch(self):
        r = self.entry(mode='inventario', batch_id=None, quantity=500)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['batch_number'], 'misturado')
        self.assertEqual(self.entry(mode='inventario', quantity=999).status_code, 200)  # com lote, sem limite
        self.assertEqual(self.total()['quantity'], 1499)
        # inventário não consome o limite da Contagem
        self.assertEqual(self.entry(quantity=80).status_code, 200)

    def test_normal_entry_requires_batch(self):
        self.assertEqual(self.entry(batch_id=None).status_code, 400)

    def test_size_product_does_not_have_is_refused(self):
        r = self.entry(size='two_liter')
        self.assertEqual(r.status_code, 400)
        self.assertIn('não possui', r.json()['detail'])
        self.assertEqual(self.entry(size='one_kg').status_code, 400)

    def test_weight_product_defaults_to_weight_sizes(self):
        data = self.client.get('/api/finished-stock/overview').json()
        sabao = next(p for p in data['products'] if p['product_id'] == 'sabao')
        self.assertEqual([s['label'] for s in sabao['sizes']], ['330g', '500g', '1Kg'])
        self.assertNotIn('velho', [p['product_id'] for p in data['products']])

    def test_exit_with_many_items_is_all_or_nothing(self):
        self.entry(quantity=10)
        r = self.client.post('/api/finished-stock/exits', json={'items': [
            {'product_id': 'desinf', 'size': 'one_liter', 'quantity': 5},
            {'product_id': 'desinf', 'size': 'five_liter', 'quantity': 1}]})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.total()['quantity'], 10)
        self.assertEqual(self.db.store.finished_stock_movements.count_documents({'type': 'saida'}), 0)

    def test_cancel_entry_and_exit(self):
        entry = self.entry(quantity=30).json()
        out = self.client.post('/api/finished-stock/exits', json={
            'items': [{'product_id': 'desinf', 'size': 'one_liter', 'quantity': 25}]}).json()['movements'][0]
        # entrada não pode ser estornada enquanto a saída consome essas unidades
        self.assertEqual(self.client.post(f"/api/finished-stock/movements/{entry['id']}/cancel").status_code, 400)
        self.assertEqual(self.client.post(f"/api/finished-stock/movements/{out['id']}/cancel").status_code, 200)
        self.assertEqual(self.total()['quantity'], 30)
        self.assertEqual(self.client.post(f"/api/finished-stock/movements/{out['id']}/cancel").status_code, 400)
        self.assertEqual(self.client.post(f"/api/finished-stock/movements/{entry['id']}/cancel").status_code, 200)
        self.assertEqual(self.total()['quantity'], 0)
        # estorno devolve o limite da Contagem
        self.assertEqual(self.entry(quantity=80).status_code, 200)

    def test_management_list_print_then_confirm(self):
        self.entry(quantity=35)
        lst = self.client.post('/api/finished-stock/lists', json={
            'items': [{'product_id': 'desinf', 'size': 'one_liter', 'quantity': 25}]}).json()
        self.assertEqual(lst['items'][0]['label'], '1L')
        self.assertEqual(self.total()['quantity'], 35)  # criar a lista não mexe no estoque
        r = self.client.post(f"/api/finished-stock/lists/{lst['id']}/confirm", json={'operator': 'Vitor'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.total()['quantity'], 10)
        self.assertEqual(len(r.json()['notifications']), 1)
        again = self.client.post(f"/api/finished-stock/lists/{lst['id']}/confirm", json={})
        self.assertEqual(again.status_code, 400)
        self.assertEqual(self.total()['quantity'], 10)

    def test_failed_list_confirmation_stays_pending(self):
        lst = self.client.post('/api/finished-stock/lists', json={
            'items': [{'product_id': 'desinf', 'size': 'one_liter', 'quantity': 5}]}).json()
        self.assertEqual(self.client.post(f"/api/finished-stock/lists/{lst['id']}/confirm", json={}).status_code, 400)
        self.assertEqual(self.db.store.finished_stock_lists.find_one({'id': lst['id']})['status'], 'pendente')

    def test_barcodes_register_lookup_and_uniqueness(self):
        put = lambda **kw: self.client.put('/api/finished-stock/barcodes', json=kw)
        self.assertEqual(put(product_id='desinf', size='one_liter', code='7890001').status_code, 200)
        found = self.client.get('/api/finished-stock/barcode/7890001').json()
        self.assertEqual((found['product_id'], found['size'], found['label']), ('desinf', 'one_liter', '1L'))
        r = put(product_id='desinf', size='five_liter', code='7890001')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Desinfetante 1L', r.json()['detail'])
        self.assertEqual(put(product_id='desinf', size='one_liter', code='7890002').status_code, 200)  # troca
        self.assertEqual(self.client.get('/api/finished-stock/barcode/7890001').status_code, 404)
        self.assertEqual(self.total()['barcode'], '7890002')
        self.assertEqual(put(product_id='desinf', size='one_liter', code='').status_code, 200)  # remove
        self.assertEqual(self.client.get('/api/finished-stock/barcodes').json(), [])
        self.assertEqual(put(product_id='desinf', size='one_kg', code='1').status_code, 400)

    def test_product_config_sizes_and_minimums(self):
        r = self.client.put('/api/finished-stock/products/sabao/config', json={
            'sizes': ['one_kg'], 'minimums': {'one_kg': 5}})
        self.assertEqual(r.status_code, 200)
        sabao = next(p for p in self.client.get('/api/finished-stock/overview').json()['products']
                     if p['product_id'] == 'sabao')
        self.assertEqual([(s['label'], s['minimum']) for s in sabao['sizes']], [('1Kg', 5)])
        self.assertEqual(self.client.put('/api/finished-stock/products/sabao/config', json={
            'sizes': ['one_liter']}).status_code, 400)
        self.assertEqual(self.client.put('/api/finished-stock/products/sabao/config', json={
            'sizes': ['one_kg'], 'minimums': {'one_kg': -1}}).status_code, 400)
        # dados de produção do produto não são tocados
        doc = self.db.store.products.find_one({'id': 'sabao'})
        self.assertEqual((doc['name'], doc['unit']), ('Sabão em pó', 'Kg'))

    def bulk(self, updates):
        return self.client.put('/api/finished-stock/minimums/bulk', json={'updates': updates})

    def test_bulk_minimums_apply_standard_to_many_products(self):
        self.db.store.products.insert_many([
            {'id': f'p{i}', 'name': f'Produto {i}', 'unit': 'Litros', 'deleted': False} for i in range(15)])
        std = {'two_liter': 20, 'five_liter': 10}
        r = self.bulk([{'product_id': f'p{i}', 'minimums': std} for i in range(15)])
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {'updated': 15, 'skipped': []})
        doc = self.db.store.products.find_one({'id': 'p7'})
        self.assertEqual(doc['stock_minimums'], std)
        self.assertEqual(doc['stock_sizes'], [])  # sem tamanhos definidos: continua mostrando todos
        sizes = next(p for p in self.client.get('/api/finished-stock/overview').json()['products']
                     if p['product_id'] == 'p7')['sizes']
        self.assertEqual([(s['label'], s['minimum']) for s in sizes], [('500ml', 0), ('1L', 0), ('2L', 20), ('5L', 10)])

    def test_bulk_adds_size_to_product_with_defined_sizes(self):
        self.bulk([{'product_id': 'desinf', 'minimums': {'two_liter': 6}}])  # desinf tem 1L e 5L
        doc = self.db.store.products.find_one({'id': 'desinf'})
        self.assertEqual(doc['stock_sizes'], ['one_liter', 'two_liter', 'five_liter'])

    def test_bulk_merges_without_erasing_other_sizes(self):
        # desinf: tamanhos 1L e 5L, mínimo 1L = 10
        r = self.bulk([{'product_id': 'desinf', 'minimums': {'five_liter': 3}}])
        self.assertEqual(r.status_code, 200)
        doc = self.db.store.products.find_one({'id': 'desinf'})
        self.assertEqual(doc['stock_minimums'], {'one_liter': 10, 'five_liter': 3})
        self.assertEqual(doc['stock_sizes'], ['one_liter', 'five_liter'])
        self.bulk([{'product_id': 'desinf', 'minimums': {'one_liter': 0}}])  # 0 remove o mínimo
        doc = self.db.store.products.find_one({'id': 'desinf'})
        self.assertEqual(doc['stock_minimums'], {'five_liter': 3})
        self.assertEqual(doc['stock_sizes'], ['one_liter', 'five_liter'])  # tamanho continua

    def test_bulk_skips_sizes_of_other_unit_and_validates_first(self):
        r = self.bulk([{'product_id': 'desinf', 'minimums': {'two_liter': 20}},
                       {'product_id': 'sabao', 'minimums': {'two_liter': 20, 'one_kg': 5}}])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['skipped'], [{'product_id': 'sabao', 'name': 'Sabão em pó', 'sizes': ['2L']}])
        self.assertEqual(self.db.store.products.find_one({'id': 'sabao'})['stock_minimums'], {'one_kg': 5})
        before = list(self.db.store.products.find({}, {'_id': 0}))
        bad = self.bulk([{'product_id': 'desinf', 'minimums': {'one_liter': 99}},
                         {'product_id': 'sabao', 'minimums': {'one_kg': -1}}])
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(list(self.db.store.products.find({}, {'_id': 0})), before)  # nada gravado
        self.assertEqual(self.bulk([{'product_id': 'velho', 'minimums': {'one_liter': 1}}]).status_code, 404)
        self.assertEqual(self.bulk([{'product_id': 'desinf'}, {'product_id': 'desinf'}]).status_code, 400)

    def test_unmarked_size_with_stock_stays_visible_and_can_leave(self):
        self.entry(quantity=12)  # 12 garrafas de 1L
        self.client.put('/api/finished-stock/products/desinf/config', json={'sizes': ['five_liter']})
        row = self.total()
        self.assertEqual((row['quantity'], row['unlisted']), (12, True))
        self.assertEqual(self.entry(quantity=1).status_code, 400)  # nova entrada não, tamanho desmarcado
        r = self.client.post('/api/finished-stock/exits', json={
            'items': [{'product_id': 'desinf', 'size': 'one_liter', 'quantity': 12}]})
        self.assertEqual(r.status_code, 200, r.text)
        sizes = next(p for p in self.client.get('/api/finished-stock/overview').json()['products']
                     if p['product_id'] == 'desinf')['sizes']
        self.assertEqual([s['label'] for s in sizes], ['5L'])  # zerou: some da tela

    def test_concurrent_lock_is_released(self):
        self.db.store.finished_stock_locks.insert_one({'_id': 'desinf', 'owner': 'x', 'at': '2999-01-01'})
        self.assertEqual(self.entry().status_code, 409)
        self.db.store.finished_stock_locks.update_one({'_id': 'desinf'}, {'$set': {'at': '2000-01-01'}})  # trava velha
        self.assertEqual(self.entry().status_code, 200)
        self.assertEqual(self.db.store.finished_stock_locks.count_documents({}), 0)


if __name__ == '__main__':
    unittest.main()
