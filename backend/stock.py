"""Movimentos de estoque, sem migração ou recálculo automático de dados antigos.

Receitas guardam a quantidade TOTAL para ``expected_liters``. Lotes de MP
guardam o saldo restante. A ordem de produção apenas documenta um lote de
produto que já fez a baixa; ela nunca desconta de novo.
"""

from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


PRECISION = Decimal('0.000001')
EPSILON = 0.000001


def quantity(value, *, positive=False):
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number < 0 or (positive and number <= 0):
            raise ValueError
        rounded = float(number.quantize(PRECISION, rounding=ROUND_HALF_UP))
        if positive and rounded <= 0:
            raise ValueError
        return rounded
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError('A quantidade deve ser um número finito ' + ('maior que zero' if positive else 'não negativo'))


def unit_info(unit):
    name = str(unit or '').strip().lower()
    units = {
        'kg': ('mass', Decimal(1)), 'quilo': ('mass', Decimal(1)),
        'g': ('mass', Decimal('0.001')), 'gramas': ('mass', Decimal('0.001')),
        'l': ('volume', Decimal(1)), 'litro': ('volume', Decimal(1)),
        'litros': ('volume', Decimal(1)), 'ml': ('volume', Decimal('0.001')),
    }
    if name not in units:
        raise ValueError(f'Unidade de medida não reconhecida: {unit}')
    return units[name]


def convert_quantity(value, source, target):
    source_kind, source_factor = unit_info(source)
    target_kind, target_factor = unit_info(target)
    if source_kind != target_kind:
        raise ValueError(f'Não é possível converter {source} para {target} sem uma densidade cadastrada')
    return quantity(Decimal(str(value)) * source_factor / target_factor)


def calculate_recipe_requirements(product, planned_quantity):
    expected = quantity(product.get('expected_liters'), positive=True)
    planned = quantity(planned_quantity, positive=True)
    recipes = product.get('recipes') or []
    if not recipes:
        raise ValueError('Produto sem receita cadastrada: nenhuma baixa foi realizada')
    merged = {}
    for recipe in recipes:
        material_id = recipe.get('raw_material_id')
        if not material_id:
            raise ValueError('Existe um item da receita sem matéria-prima vinculada')
        amount = quantity(recipe.get('quantity_per_liter', 0))
        unit = recipe.get('unit') or 'L'
        if material_id not in merged:
            merged[material_id] = {'raw_material_id': material_id, 'quantity': 0.0, 'unit': unit}
        row = merged[material_id]
        amount = convert_quantity(amount, unit, row['unit'])
        row['quantity'] = quantity(Decimal(str(row['quantity'])) + Decimal(str(amount)) * Decimal(str(planned)) / Decimal(str(expected)))
    return [row for row in merged.values() if row['quantity'] > 0]


async def product_requirements(db, product, planned_quantity):
    """Escala a receita; a unidade final do produto não participa da baixa.

    Cadastros legados da Lumix têm rótulos de estoque em Litros para insumos
    pesados em Kg. Por regra operacional, nesses casos o saldo numérico é
    tratado na unidade-base da receita, sem conversão física massa/volume e
    sem alterar o cadastro ou regravar saldos históricos.
    """
    rows = calculate_recipe_requirements(product, planned_quantity)
    for row in rows:
        material = await db.raw_materials.find_one({'id': row['raw_material_id'], 'deleted': {'$ne': True}}, {'_id': 0})
        if not material:
            raise ValueError(f'Matéria-prima {row["raw_material_id"]} inexistente ou excluída')
        recipe_kind, _ = unit_info(row['unit'])
        stock_kind, _ = unit_info(material['type'])
        if recipe_kind == stock_kind:
            row['quantity'] = convert_quantity(row['quantity'], row['unit'], material['type'])
            row['unit'] = material['type']
        else:
            # O número disponível segue a receita; o rótulo antigo não obriga
            # uma conversão Kg/L. g e ml continuam sendo escalas de Kg e L.
            base_unit = 'Kg' if recipe_kind == 'mass' else 'Litros'
            row['quantity'] = convert_quantity(row['quantity'], row['unit'], base_unit)
            row['unit'] = base_unit
            row['stock_quantity_basis'] = 'recipe'
            row['stock_unit_label'] = material['type']
        row['raw_material_name'] = material.get('name', '')
    return rows


async def consume_requirements(db, requirements):
    """Valida TODA a receita antes de baixar; usa saldos condicionais.

Falhas observadas são compensadas. Não redefine total_stock a partir de um
histórico possivelmente incompleto e não exige zerar nem migrar o banco.
"""
    plans = []
    for row in requirements:
        needed = quantity(row['quantity'], positive=True)
        material = await db.raw_materials.find_one({'id': row['raw_material_id'], 'deleted': {'$ne': True}}, {'_id': 0})
        if not material:
            raise ValueError('Matéria-prima não encontrada')
        batches = await db.raw_material_batches.find({
            'raw_material_id': row['raw_material_id'], 'deleted': {'$ne': True},
            'status': 'em_aberto', 'quantity': {'$gt': 0},
        }, {'_id': 0}).sort([('date', -1), ('created_at', -1), ('id', -1)]).to_list(None)
        available = quantity(sum(quantity(batch.get('quantity', 0)) for batch in batches))
        if available < needed:
            raise ValueError(f'Estoque insuficiente de {material.get("name", row["raw_material_id"])}: necessário {needed:g} {row["unit"]}, saldo dos lotes {available:g} {row["unit"]}')
        remaining = needed
        allocations = []
        for batch in batches:
            if remaining <= 0:
                break
            take = quantity(min(quantity(batch['quantity']), remaining))
            allocations.append({
                'batch_id': batch['id'], 'batch_number': batch.get('batch_number', ''),
                'supplier_batch_number': batch.get('supplier_batch_number', ''),
                'expiry_date': batch.get('expiry_date', ''), 'quantity_used': take,
                'previous_quantity': batch['quantity'],
                'remaining_after': round(float(batch['quantity']) - take, 6),
                'stock_count_id': material.get('last_physical_count_id'),
            })
            remaining = quantity(Decimal(str(remaining)) - Decimal(str(take)))
        plans.append({
            'raw_material_id': row['raw_material_id'], 'raw_material_name': material.get('name', ''),
            'quantity_needed': needed, 'unit': row['unit'], 'batches_consumed': allocations,
        })
        if row.get('stock_quantity_basis') == 'recipe':
            plans[-1].update(stock_quantity_basis='recipe', stock_unit_label=row['stock_unit_label'])

    applied, totals = [], []
    try:
        for plan in plans:
            for allocation in plan['batches_consumed']:
                result = await db.raw_material_batches.update_one({
                    'id': allocation['batch_id'], 'deleted': {'$ne': True}, 'status': 'em_aberto',
                    '_stock_operation': None,
                    'quantity': allocation['previous_quantity'],
                }, {'$set': {'quantity': allocation['remaining_after']}})
                if result.modified_count != 1:
                    raise ValueError('O estoque mudou durante a baixa. Atualize a tela e tente novamente')
                applied.append(allocation)
            result = await db.raw_materials.update_one(
                {'id': plan['raw_material_id'], 'deleted': {'$ne': True}},
                {'$inc': {'total_stock': -plan['quantity_needed']}},
            )
            if result.matched_count != 1:
                raise ValueError('A matéria-prima foi excluída durante a baixa')
            totals.append(plan)
    except Exception:
        for plan in reversed(totals):
            await db.raw_materials.update_one({'id': plan['raw_material_id']}, {'$inc': {'total_stock': plan['quantity_needed']}})
        for allocation in reversed(applied):
            await db.raw_material_batches.update_one({'id': allocation['batch_id']}, {'$inc': {'quantity': allocation['quantity_used']}})
        raise
    return plans


def batch_usages(batch):
    """Lê o formato do Emergent e o formato anterior do GitHub, sem migração."""
    result = deepcopy(batch.get('raw_materials_used') or [])
    if batch.get('raw_materials_used') is None:
        for old in batch.get('materials_used') or []:
            result.append({
                'raw_material_id': old['raw_material_id'], 'raw_material_name': old.get('raw_material_name', ''),
                'quantity_needed': old.get('quantity', 0), 'unit': old.get('unit', ''),
                'batches_consumed': [{**a, 'quantity_used': a.get('quantity', 0)} for a in old.get('allocations') or []],
            })
    merged = {}
    for row in result:
        key = row['raw_material_id']
        if key not in merged:
            merged[key] = row
        else:
            merged[key]['quantity_needed'] += row.get('quantity_needed', 0)
            merged[key]['batches_consumed'].extend(row.get('batches_consumed') or [])
    return list(merged.values())


async def _return_lot(db, allocation, material_id):
    batch = await db.raw_material_batches.find_one({'id': allocation['batch_id']}, {'_id': 0})
    if batch and batch.get('deleted'):
        raise ValueError('Um lote de matéria-prima usado foi excluído; confira-o antes de devolver o estoque')
    if not batch:
        archived = await db.archived_raw_material_batches.find_one({'id': allocation['batch_id']}, {'_id': 0})
        if not archived:
            raise ValueError('Lote de matéria-prima usado não encontrado; devolução cancelada')
        # Reabrir sem remover o histórico do arquivo. _id determinístico evita
        # criar dois saldos ativos em devoluções concorrentes do mesmo lote.
        reopened = {**archived, '_id': f'stock-return:{allocation["batch_id"]}', 'quantity': 0.0,
                    'status': 'em_aberto', 'deleted': False, 'restored_from_archive': True}
        try:
            await db.raw_material_batches.insert_one(reopened)
        except Exception:
            if not await db.raw_material_batches.find_one({'id': allocation['batch_id']}):
                raise
    return {'id': allocation['batch_id'], 'deleted': {'$ne': True}, 'raw_material_id': material_id}


async def restore_usages(db, usages):
    plans = []
    for usage in usages:
        material_id = usage['raw_material_id']
        material = await db.raw_materials.find_one({'id': material_id, 'deleted': {'$ne': True}})
        if not material:
            raise ValueError('Matéria-prima excluída; restaure seu cadastro antes de devolver o estoque')
        rows = []
        for allocation in usage.get('batches_consumed') or []:
            amount = quantity(allocation.get('quantity_used', 0))
            if amount > 0:
                if material.get('last_physical_count_id') and allocation.get('stock_count_id') != material['last_physical_count_id']:
                    raise ValueError('Este consumo é anterior à última contagem física. Confira a movimentação antes de devolver estoque antigo')
                query = await _return_lot(db, allocation, material_id)
                rows.append((query, amount))
        plans.append((material_id, rows))
    applied, totals = [], []
    try:
        for material_id, rows in plans:
            total = quantity(sum(amount for _, amount in rows))
            for query, amount in rows:
                result = await db.raw_material_batches.update_one(query, {'$inc': {'quantity': amount}, '$set': {'status': 'em_aberto'}})
                if result.matched_count != 1:
                    raise ValueError('O lote de matéria-prima mudou durante a devolução')
                applied.append((query, amount))
            if total:
                result = await db.raw_materials.update_one({'id': material_id}, {'$inc': {'total_stock': total}})
                if result.matched_count != 1:
                    raise ValueError('Matéria-prima não encontrada durante a devolução')
                totals.append((material_id, total))
    except Exception:
        for material_id, total in reversed(totals):
            await db.raw_materials.update_one({'id': material_id}, {'$inc': {'total_stock': -total}})
        for query, amount in reversed(applied):
            await db.raw_material_batches.update_one(query, {'$inc': {'quantity': -amount}})
        raise


async def receive_batch(db, batch):
    amount = quantity(batch['quantity'], positive=True)
    material_id = batch['raw_material_id']
    if not await db.raw_materials.find_one({'id': material_id, 'deleted': {'$ne': True}}):
        raise ValueError('Matéria-prima não encontrada')
    batch['quantity'] = amount
    batch['initial_quantity'] = amount
    await db.raw_material_batches.insert_one(batch)
    try:
        result = await db.raw_materials.update_one({'id': material_id, 'deleted': {'$ne': True}}, {'$inc': {'total_stock': amount}})
        if result.matched_count != 1:
            raise ValueError('Matéria-prima excluída durante o recebimento')
    except Exception:
        await db.raw_material_batches.delete_one({'id': batch['id']})
        raise


async def resize_usages(db, old_usages, requirements):
    """Edita apenas a diferença, sem devolver e descontar a receita inteira."""
    targets = {row['raw_material_id']: row for row in requirements}
    kept, releases, additions = [], [], []
    old_ids = set()
    for usage in deepcopy(old_usages):
        material_id = usage['raw_material_id']
        old_ids.add(material_id)
        target = targets.get(material_id, {'quantity': 0})
        desired = quantity(target['quantity'])
        existing = quantity(sum(a.get('quantity_used', 0) for a in usage.get('batches_consumed') or []))
        to_release = max(quantity(existing - min(existing, desired)), 0)
        returned = []
        for allocation in reversed(usage.get('batches_consumed') or []):
            amount = min(quantity(allocation['quantity_used']), to_release)
            if amount:
                returned.append({**allocation, 'quantity_used': amount})
                allocation['quantity_used'] = quantity(Decimal(str(allocation['quantity_used'])) - Decimal(str(amount)))
                to_release = quantity(Decimal(str(to_release)) - Decimal(str(amount)))
        usage['batches_consumed'] = [a for a in usage.get('batches_consumed') or [] if a['quantity_used'] > 0]
        usage['quantity_needed'] = desired
        if usage['batches_consumed']:
            kept.append(usage)
        if returned:
            releases.append({**usage, 'batches_consumed': returned})
        if desired > existing:
            additions.append({**target, 'quantity': quantity(desired - existing)})
    additions.extend(row for key, row in targets.items() if key not in old_ids and row['quantity'] > 0)
    added = await consume_requirements(db, additions)
    try:
        await restore_usages(db, releases)
    except Exception:
        await restore_usages(db, added)
        raise
    merged = {row['raw_material_id']: row for row in kept}
    for row in added:
        key = row['raw_material_id']
        if key in merged:
            merged[key]['batches_consumed'].extend(row['batches_consumed'])
            merged[key]['quantity_needed'] = targets[key]['quantity']
        else:
            merged[key] = row
    return list(merged.values())


async def stock_audit(db):
    """Conferência somente de leitura; histórico não é contagem física."""
    materials = await db.raw_materials.find({'deleted': {'$ne': True}}, {'_id': 0}).to_list(None)
    batches = await db.raw_material_batches.find({'deleted': {'$ne': True}}, {'_id': 0}).to_list(None)
    grouped = {}
    for batch in batches:
        grouped.setdefault(batch['raw_material_id'], []).append(batch)
    rows = []
    for material in materials:
        active = grouped.get(material['id'], [])
        balance = round(sum(float(b.get('quantity', 0)) for b in active if b.get('status') == 'em_aberto'), 6)
        closed_balance = round(sum(float(b.get('quantity', 0)) for b in active if b.get('status') != 'em_aberto'), 6)
        recorded = float(material.get('total_stock', 0))
        difference = round(recorded - balance, 6)
        issues = []
        if abs(difference) > EPSILON:
            issues.append('Saldo cadastrado diferente da soma dos lotes em aberto')
        if closed_balance:
            issues.append('Existem lotes encerrados com quantidade restante')
        if any(float(b.get('quantity', 0)) < 0 for b in active):
            issues.append('Existe lote com saldo negativo')
        orders = [b.get('source_order_id') for b in active if b.get('source_order_id')]
        if len(orders) != len(set(orders)):
            issues.append('Mais de uma entrada do mesmo pedido: confira possíveis recebimentos duplicados')
        rows.append({'raw_material_id': material['id'], 'name': material.get('name', ''),
                     'unit': material.get('type', ''), 'recorded_stock': recorded,
                     'batch_stock': balance, 'closed_batch_stock': closed_balance,
                     'difference': difference, 'issues': issues})
    return {'read_only': True, 'materials': rows, 'total_materials_checked': len(rows),
            'total_with_issues': sum(bool(row['issues']) for row in rows),
            'message': 'Conferência sem alterar saldos. Divergências antigas exigem conferir movimentações ou contagem física.'}
