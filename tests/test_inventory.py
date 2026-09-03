import sys
import unittest
import asyncio
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

from inventory import calculate_recipe_requirements, consume_requirements


def _matches(document, query):
    for key, expected in query.items():
        actual = document.get(key)
        if isinstance(expected, dict):
            if '$gt' in expected and not actual > expected['$gt']:
                return False
            if '$gte' in expected and not actual >= expected['$gte']:
                return False
        elif actual != expected:
            return False
    return True


class _Result:
    def __init__(self, count):
        self.matched_count = count
        self.modified_count = count


class _Cursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, fields):
        for field, direction in reversed(fields):
            self.documents.sort(key=lambda item: item.get(field, ''), reverse=direction < 0)
        return self

    async def to_list(self, _limit):
        return [dict(item) for item in self.documents]


class _Collection:
    def __init__(self, documents):
        self.documents = documents

    async def find_one(self, query, _projection=None):
        return next((dict(item) for item in self.documents if _matches(item, query)), None)

    def find(self, query, _projection=None):
        return _Cursor([item for item in self.documents if _matches(item, query)])

    async def update_one(self, query, update):
        item = next((item for item in self.documents if _matches(item, query)), None)
        if not item:
            return _Result(0)
        for key, value in update.get('$inc', {}).items():
            item[key] = item.get(key, 0) + value
        item.update(update.get('$set', {}))
        return _Result(1)

    def aggregate(self, pipeline):
        matched = [item for item in self.documents if _matches(item, pipeline[0]['$match'])]
        total = sum(item.get('quantity', 0) for item in matched)
        return _Cursor([{'_id': None, 'total': total}] if matched else [])


class _DB:
    def __init__(self, materials, batches):
        self.raw_materials = _Collection(materials)
        self.raw_material_batches = _Collection(batches)


class InventoryCalculationTests(unittest.TestCase):
    def test_recipe_is_scaled_from_its_expected_yield(self):
        product = {
            'expected_liters': 1000,
            'recipes': [
                {'raw_material_id': 'water', 'quantity_per_liter': 800, 'unit': 'L'},
                {'raw_material_id': 'active', 'quantity_per_liter': 5, 'unit': 'Kg'},
            ],
        }

        result = calculate_recipe_requirements(product, 250)

        self.assertEqual(result, [
            {'raw_material_id': 'water', 'quantity': 200.0, 'unit': 'L'},
            {'raw_material_id': 'active', 'quantity': 1.25, 'unit': 'Kg'},
        ])

    def test_duplicate_recipe_rows_are_merged(self):
        product = {
            'expected_liters': 100,
            'recipes': [
                {'raw_material_id': 'x', 'quantity_per_liter': 2, 'unit': 'Kg'},
                {'raw_material_id': 'x', 'quantity_per_liter': 3, 'unit': 'Kg'},
            ],
        }

        self.assertEqual(calculate_recipe_requirements(product, 50), [
            {'raw_material_id': 'x', 'quantity': 2.5, 'unit': 'Kg'}
        ])

    def test_invalid_yields_or_batch_sizes_are_rejected(self):
        for expected, planned in [(0, 10), (-1, 10), (100, 0), (100, -1)]:
            with self.subTest(expected=expected, planned=planned):
                with self.assertRaises(ValueError):
                    calculate_recipe_requirements(
                        {'expected_liters': expected, 'recipes': []}, planned
                    )

    def test_consumption_crosses_batches_and_syncs_total(self):
        materials = [{
            'id': 'x', 'name': 'Essência', 'type': 'Kg', 'deleted': False,
            'total_stock': 999, 'stock_reconciled_at': '2026-09-03T00:00:00Z',
        }]
        batches = [
            {'id': 'old', 'raw_material_id': 'x', 'batch_number': '1', 'date': '2026-01-01', 'created_at': '1', 'quantity': 4.0, 'deleted': False},
            {'id': 'new', 'raw_material_id': 'x', 'batch_number': '2', 'date': '2026-02-01', 'created_at': '2', 'quantity': 2.0, 'deleted': False},
        ]
        db = _DB(materials, batches)

        usage = asyncio.run(consume_requirements(db, [
            {'raw_material_id': 'x', 'quantity': 3.5, 'unit': 'Kg'}
        ]))

        self.assertEqual(usage[0]['allocations'], [
            {'batch_id': 'new', 'batch_number': '2', 'quantity': 2.0},
            {'batch_id': 'old', 'batch_number': '1', 'quantity': 1.5},
        ])
        self.assertEqual(batches[0]['quantity'], 2.5)
        self.assertEqual(batches[1]['quantity'], 0.0)
        self.assertEqual(materials[0]['total_stock'], 2.5)

    def test_old_unreconciled_stock_is_blocked(self):
        db = _DB(
            [{'id': 'x', 'name': 'Essência', 'type': 'Kg', 'deleted': False, 'total_stock': 50}],
            [{'id': 'b', 'raw_material_id': 'x', 'quantity': 50, 'deleted': False}],
        )
        with self.assertRaisesRegex(ValueError, 'contagem física'):
            asyncio.run(consume_requirements(db, [
                {'raw_material_id': 'x', 'quantity': 1, 'unit': 'Kg'}
            ]))


if __name__ == '__main__':
    unittest.main()
