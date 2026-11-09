"""Contagem física explícita com prévia, controle de versão e histórico."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from uuid import uuid4

from fastapi import HTTPException

from stock import quantity
from stock_control import current_stock_operation


def digest(data):
    return sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


async def snapshot(db, material_id):
    first = await db.stock_control.find_one({'_id': 'inventory'}) or {}
    operation = current_stock_operation()
    own_owner = operation['owner'] if operation and operation['db'] is db else None
    if first.get('owner') is not None and first['owner'] != own_owner:
        raise HTTPException(status_code=409, detail='Aguarde a movimentação de estoque terminar antes de conferir a contagem')
    material = await db.raw_materials.find_one({'id': material_id, 'deleted': False}, {'_id': 0})
    if not material:
        raise HTTPException(status_code=404, detail='Matéria-prima não encontrada')
    lots = await db.raw_material_batches.find(
        {'raw_material_id': material_id, 'deleted': {'$ne': True}}, {'_id': 0},
    ).sort([('date', -1), ('created_at', -1), ('id', -1)]).to_list(None)
    if any(lot.get('_stock_operation') for lot in lots):
        raise HTTPException(status_code=409, detail='Existe um lote com movimentação pendente. Confira essa operação antes de ajustar')
    last = await db.stock_control.find_one({'_id': 'inventory'}) or {}
    if last.get('revision', 0) != first.get('revision', 0) or last.get('owner') != first.get('owner'):
        raise HTTPException(status_code=409, detail='O estoque mudou durante a consulta. Confira novamente')
    version = digest({'material': material, 'lots': lots, 'revision': last.get('revision', 0)})
    return material, lots, version


def make_plan(material, all_lots, counted_stock, lot_counts=None):
    counted = quantity(counted_stock)
    lots = [lot for lot in all_lots if lot.get('status') == 'em_aberto']
    if lot_counts is None:
        values = {lot['id']: quantity(max(float(lot.get('quantity', 0)), 0)) for lot in lots}
        excess = max(round(sum(values.values()) - counted, 6), 0)
        # A sugestão fica visível e editável antes de confirmar: diminuir os
        # lotes mais recentes primeiro segue a mesma ordem de consumo LIFO.
        for lot in lots:
            removed = min(values[lot['id']], excess)
            values[lot['id']] = round(values[lot['id']] - removed, 6)
            excess = round(excess - removed, 6)
    else:
        if len(lot_counts) != len(lots) or {row['batch_id'] for row in lot_counts} != {lot['id'] for lot in lots}:
            raise ValueError('A lista de lotes mudou ou contém itens repetidos. Gere outra prévia')
        values = {row['batch_id']: quantity(row['quantity']) for row in lot_counts}
    allocated = round(sum(values.values()), 6)
    if allocated > counted:
        raise ValueError('A soma das quantidades dos lotes excede o saldo contado')
    changes = [{
        'batch_id': lot['id'], 'batch_number': lot.get('batch_number', ''),
        'supplier_batch_number': lot.get('supplier_batch_number', ''),
        'before': float(lot.get('quantity', 0)), 'after': values[lot['id']],
    } for lot in lots]
    before_lots = round(sum(float(lot.get('quantity', 0)) for lot in lots), 6)
    return {
        'raw_material_id': material['id'], 'name': material.get('name', ''), 'unit': material['type'],
        'before_total': float(material.get('total_stock', 0)), 'before_lots_total': before_lots,
        'counted_stock': counted, 'difference': round(counted - float(material.get('total_stock', 0)), 6),
        'lot_changes': changes, 'unassigned_quantity': round(counted - allocated, 6),
    }


async def preview_count(db, material_id, counted_stock):
    material, lots, version = await snapshot(db, material_id)
    return {**make_plan(material, lots, counted_stock), 'expected_version': version, 'read_only': True}


def public_count(document):
    fields = ('id', 'raw_material_id', 'name', 'unit', 'before_total', 'before_lots_total',
              'counted_stock', 'difference', 'lot_changes', 'unassigned_quantity',
              'reason', 'created_at', 'created_by_name', 'created_by_email', 'status')
    return {key: document.get(key) for key in fields}


async def apply_count(db, material_id, counted_stock, reason, expected_version, request_id, lot_counts, user):
    counted = quantity(counted_stock)
    reason = reason.strip()
    if len(reason) < 3:
        raise ValueError('Informe o motivo da contagem')
    signature = digest({'material_id': material_id, 'counted': counted, 'reason': reason,
                        'version': expected_version, 'lot_counts': lot_counts, 'actor': user['id']})
    old = await db.stock_counts.find_one({'_id': request_id})
    if old:
        if old.get('status') == 'applied' and old.get('request_signature') == signature:
            return public_count(old)
        raise HTTPException(status_code=409, detail='Esta confirmação já foi usada. Gere uma nova prévia')
    material, all_lots, version = await snapshot(db, material_id)
    if version != expected_version:
        raise HTTPException(status_code=409, detail='Houve movimentação desde a prévia. Confira o saldo e gere outra prévia antes de confirmar')
    plan = make_plan(material, all_lots, counted, lot_counts)
    lots = {lot['id']: lot for lot in all_lots if lot.get('status') == 'em_aberto'}
    now = datetime.now(timezone.utc).isoformat()
    journal = {**plan, '_id': request_id, 'id': request_id, 'status': 'pending',
               'reason': reason, 'created_at': now, 'created_by': user['id'],
               'created_by_name': user.get('name', ''), 'created_by_email': user.get('email', ''),
               'request_signature': signature, 'before_material': material,
               'before_batches': list(lots.values())}
    # O histórico pendente preserva os valores anteriores antes de qualquer ajuste.
    await db.stock_counts.insert_one(journal)
    touched = []
    adjustment_id = None
    material_touched = False
    try:
        for change in plan['lot_changes']:
            touched.append(change['batch_id'])
            result = await db.raw_material_batches.update_one(
                {'id': change['batch_id'], 'quantity': change['before'], 'status': 'em_aberto'},
                {'$set': {'quantity': change['after'],
                          'status': 'em_aberto' if change['after'] > 0 else 'finalizado',
                          'last_physical_count_id': request_id, 'stock_counted_at': now}},
            )
            if result.matched_count != 1:
                raise ValueError('Um lote mudou durante a contagem. O ajuste foi cancelado')
        if plan['unassigned_quantity'] > 0:
            adjustment_id = str(uuid4())
            await db.raw_material_batches.insert_one({
                'id': adjustment_id, 'raw_material_id': material_id,
                'batch_number': f'AJUSTE-{now[:10].replace("-", "")}-{request_id[:8].upper()}',
                'date': now[:10], 'quantity': plan['unassigned_quantity'], 'status': 'em_aberto',
                'supplier_batch_number': '', 'expiry_date': '', 'created_at': now, 'deleted': False,
                'is_inventory_adjustment': True, 'stock_count_id': request_id,
                'last_physical_count_id': request_id,
            })
        material_touched = True
        result = await db.raw_materials.update_one(
            {'id': material_id, 'deleted': False},
            {'$set': {'total_stock': counted, 'last_physical_count_id': request_id, 'stock_counted_at': now}},
        )
        if result.matched_count != 1:
            raise ValueError('A matéria-prima mudou durante a contagem')
        await db.stock_counts.update_one({'_id': request_id}, {'$set': {'status': 'applied', 'adjustment_batch_id': adjustment_id}})
    except Exception:
        try:
            if adjustment_id:
                await db.raw_material_batches.delete_one({'id': adjustment_id, 'stock_count_id': request_id})
            for batch_id in reversed(touched):
                restored = await db.raw_material_batches.replace_one(
                    {'id': batch_id, 'last_physical_count_id': request_id}, lots[batch_id])
                if restored.matched_count != 1:
                    current = await db.raw_material_batches.find_one({'id': batch_id}, {'_id': 0})
                    if current != lots[batch_id]:
                        raise RuntimeError('Saldo do lote exige conferência antes de liberar novas movimentações')
            if material_touched:
                restored = await db.raw_materials.replace_one(
                    {'id': material_id, 'last_physical_count_id': request_id}, material)
                if restored.matched_count != 1:
                    current = await db.raw_materials.find_one({'id': material_id}, {'_id': 0})
                    if current != material:
                        raise RuntimeError('Saldo da matéria-prima exige conferência antes de liberar novas movimentações')
            await db.stock_counts.update_one({'_id': request_id}, {'$set': {'status': 'failed'}})
        except Exception:
            operation = current_stock_operation()
            if operation:
                operation['retain'] = True
            raise
        raise
    journal['status'] = 'applied'
    return public_count(journal)
