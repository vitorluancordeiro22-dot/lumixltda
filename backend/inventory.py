"""Funções centrais de estoque de matérias-primas.

O saldo dos lotes é a fonte de verdade. ``raw_materials.total_stock`` é apenas
um total consolidado para deixar as telas rápidas e deve sempre ser
sincronizado depois de qualquer movimentação.
"""

from collections import defaultdict
from datetime import datetime, timezone
from uuid import uuid4


STOCK_EPSILON = 1e-6


def calculate_recipe_requirements(product: dict, production_quantity: float) -> list[dict]:
    """Calcula o consumo proporcional da receita.

    No cadastro, ``quantity_per_liter`` guarda a quantidade TOTAL usada para
    produzir ``expected_liters`` (o próprio formulário chama o campo de
    "Qtd. Total"). Portanto o cálculo correto é:

        quantidade_da_receita / rendimento_da_receita * tamanho_do_lote
    """
    expected = float(product.get('expected_liters') or 0)
    planned = float(production_quantity or 0)
    if expected <= 0:
        raise ValueError('O rendimento esperado do produto deve ser maior que zero')
    if planned <= 0:
        raise ValueError('A quantidade do lote deve ser maior que zero')

    merged = defaultdict(lambda: {'quantity': 0.0, 'unit': ''})
    for recipe in product.get('recipes', []):
        material_id = recipe.get('raw_material_id')
        if not material_id:
            continue
        recipe_total = float(recipe.get('quantity_per_liter') or 0)
        if recipe_total < 0:
            raise ValueError('A quantidade da receita não pode ser negativa')
        merged[material_id]['quantity'] += (recipe_total / expected) * planned
        merged[material_id]['unit'] = recipe.get('unit', '')

    return [
        {
            'raw_material_id': material_id,
            'quantity': round(values['quantity'], 6),
            'unit': values['unit'],
        }
        for material_id, values in merged.items()
        if values['quantity'] > STOCK_EPSILON
    ]


async def get_material_batch_total(db, material_id: str) -> float:
    pipeline = [
        {'$match': {'raw_material_id': material_id, 'deleted': False}},
        {'$group': {'_id': None, 'total': {'$sum': '$quantity'}}},
    ]
    rows = await db.raw_material_batches.aggregate(pipeline).to_list(1)
    return round(max(float(rows[0]['total']) if rows else 0.0, 0.0), 6)


async def sync_material_total_stock(db, material_id: str) -> float:
    total = await get_material_batch_total(db, material_id)
    await db.raw_materials.update_one(
        {'id': material_id},
        {'$set': {'total_stock': total, 'stock_synced_at': datetime.now(timezone.utc).isoformat()}},
    )
    return total


async def consume_requirements(db, requirements: list[dict]) -> list[dict]:
    """Baixa lotes em LIFO, atravessando quantos lotes forem necessários.

    Primeiro valida todas as matérias-primas. As alterações usam condição de
    saldo e têm compensação caso outra requisição consuma o mesmo lote durante
    a operação.
    """
    plans = []
    for requirement in requirements:
        material_id = requirement['raw_material_id']
        needed = round(float(requirement['quantity']), 6)
        material = await db.raw_materials.find_one(
            {'id': material_id, 'deleted': False}, {'_id': 0}
        )
        if not material:
            raise ValueError(f'Matéria-prima {material_id} não encontrada')
        if not material.get('stock_reconciled_at'):
            raise ValueError(
                f'O saldo de {material.get("name", material_id)} ainda precisa de contagem física. '
                'Abra a matéria-prima, informe o saldo contado e salve.'
            )

        batches = await db.raw_material_batches.find(
            {
                'raw_material_id': material_id,
                'deleted': False,
                'quantity': {'$gt': STOCK_EPSILON},
            },
            {'_id': 0},
        ).sort([('date', -1), ('created_at', -1)]).to_list(10000)

        available = round(sum(float(batch.get('quantity', 0)) for batch in batches), 6)
        if available + STOCK_EPSILON < needed:
            raise ValueError(
                f'Estoque insuficiente de {material.get("name", material_id)}: '
                f'necessário {needed:.3f}, disponível {available:.3f}'
            )

        remaining = needed
        allocations = []
        for batch in batches:
            if remaining <= STOCK_EPSILON:
                break
            take = round(min(float(batch.get('quantity', 0)), remaining), 6)
            allocations.append({
                'batch_id': batch['id'],
                'batch_number': batch.get('batch_number', ''),
                'quantity': take,
            })
            remaining = round(remaining - take, 6)

        plans.append({
            'raw_material_id': material_id,
            'raw_material_name': material.get('name', ''),
            'quantity': needed,
            'unit': requirement.get('unit') or material.get('type', ''),
            'allocations': allocations,
        })

    applied = []
    try:
        for plan in plans:
            for allocation in plan['allocations']:
                result = await db.raw_material_batches.update_one(
                    {
                        'id': allocation['batch_id'],
                        'deleted': False,
                        'quantity': {'$gte': allocation['quantity'] - STOCK_EPSILON},
                    },
                    {'$inc': {'quantity': -allocation['quantity']}},
                )
                if result.modified_count != 1:
                    raise ValueError('O estoque mudou durante a operação. Tente novamente.')
                applied.append((plan['raw_material_id'], allocation))
    except Exception:
        for _, allocation in reversed(applied):
            await db.raw_material_batches.update_one(
                {'id': allocation['batch_id']},
                {'$inc': {'quantity': allocation['quantity']}},
            )
        raise

    for material_id in {plan['raw_material_id'] for plan in plans}:
        await sync_material_total_stock(db, material_id)
    return plans


async def restore_allocations(db, usages: list[dict]) -> None:
    material_ids = set()
    for usage in usages or []:
        material_id = usage.get('raw_material_id')
        material_ids.add(material_id)
        for allocation in usage.get('allocations', []):
            await db.raw_material_batches.update_one(
                {'id': allocation.get('batch_id')},
                {'$inc': {'quantity': float(allocation.get('quantity', 0))}},
            )
    for material_id in material_ids:
        if material_id:
            await sync_material_total_stock(db, material_id)


async def reconcile_physical_stock(db, material: dict, counted_stock: float, user: dict, notes: str = '') -> float:
    """Ajusta os lotes para que a soma seja igual à contagem física informada."""
    counted = round(float(counted_stock), 6)
    if counted < 0:
        raise ValueError('O estoque contado não pode ser negativo')

    material_id = material['id']
    batches = await db.raw_material_batches.find(
        {'raw_material_id': material_id, 'deleted': False, 'quantity': {'$gt': STOCK_EPSILON}},
        {'_id': 0},
    ).sort([('date', -1), ('created_at', -1)]).to_list(10000)
    previous = round(sum(float(batch.get('quantity', 0)) for batch in batches), 6)
    difference = round(counted - previous, 6)

    if difference > STOCK_EPSILON:
        now = datetime.now(timezone.utc)
        await db.raw_material_batches.insert_one({
            'id': str(uuid4()),
            'raw_material_id': material_id,
            'batch_number': f'AJUSTE-{now.strftime("%Y%m%d%H%M%S")}-{str(uuid4())[:4].upper()}',
            'date': now.date().isoformat(),
            'quantity': difference,
            'supplier_batch_number': '',
            'expiry_date': '',
            'status': 'em_aberto',
            'created_at': now.isoformat(),
            'deleted': False,
            'is_inventory_adjustment': True,
        })
    elif difference < -STOCK_EPSILON:
        remaining = -difference
        for batch in batches:
            if remaining <= STOCK_EPSILON:
                break
            take = round(min(float(batch.get('quantity', 0)), remaining), 6)
            await db.raw_material_batches.update_one(
                {'id': batch['id']}, {'$inc': {'quantity': -take}}
            )
            remaining = round(remaining - take, 6)

    await db.inventory_adjustments.insert_one({
        'id': str(uuid4()),
        'raw_material_id': material_id,
        'previous_stock': previous,
        'counted_stock': counted,
        'difference': difference,
        'notes': notes,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': user.get('id', ''),
        'created_by_name': user.get('name', ''),
    })
    await db.raw_materials.update_one(
        {'id': material_id},
        {'$set': {'stock_reconciled_at': datetime.now(timezone.utc).isoformat()}},
    )
    return await sync_material_total_stock(db, material_id)
