"""Saída do Depósito pelo relatório de vendas do GigaMob (PDF). Somente Laboratório.

- O PDF é lido em memória e descartado; preços e valores nunca são guardados.
- Cada código do GigaMob precisa estar ligado a um produto+tamanho (ou marcado "ignorar").
  Código novo/sem ligação = o sistema pergunta antes de baixar.
- A baixa sai só do Depósito. Se faltar saldo, baixa o que existe e registra a falta.
"""
import asyncio
import os
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from finished_stock import SIZES, MIXED, now_iso, product_kind, plan_partial
from sales_report import MAX_PDF_BYTES, fingerprint, parse_report, periods_overlap, suggest_product

DEFAULT_LAB_EMAILS = ('laboratoriolumix@outlook.com', 'leonicelaboratorio@lumix.com')
PENDING_TTL = timedelta(hours=24)

BLOCK_MESSAGES = {
    'unmapped': 'Ainda há códigos do relatório sem produto ligado. Ligue ou ignore cada um.',
    'fractional': 'Há produto ligado com quantidade fracionada no relatório. Confira o PDF.',
    'incomplete': 'O PDF não foi lido por completo (a soma não bate com o total do relatório). Gere o relatório de novo.',
    'duplicate': 'Este relatório já foi baixado antes.',
}


def lab_emails():
    """E-mails do Laboratório (os mesmos do login). LUMIX_SALES_EMAILS acrescenta outros, se precisar."""
    extra = [e.strip().lower() for e in os.environ.get('LUMIX_SALES_EMAILS', '').split(',') if e.strip()]
    return {e.lower() for e in DEFAULT_LAB_EMAILS} | set(extra)


def period_text(period):
    if not period:
        return 'sem período'
    fmt = lambda iso: '/'.join(reversed(iso.split('-')))
    return fmt(period['start']) if period['start'] == period['end'] else f"{fmt(period['start'])} a {fmt(period['end'])}"


class CodeItem(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    action: str                      # map | ignore | clear
    product_id: Optional[str] = None
    size: Optional[str] = None
    name: str = ''


class CodesSave(BaseModel):
    items: List[CodeItem] = Field(min_length=1, max_length=2000)


class ConfirmData(BaseModel):
    allow_overlap: bool = False
    operator: str = ''


def setup_sales_routes(router: APIRouter, db, get_current_user, product_lock):
    sales = APIRouter(prefix='/sales')

    async def lab_user(current_user=Depends(get_current_user)):
        if (current_user.get('email') or '').strip().lower() not in lab_emails():
            raise HTTPException(status_code=403, detail='Somente o Laboratório pode usar o relatório de vendas')
        return current_user

    def who(user):
        return user.get('name') or user.get('email', '')

    async def get_doc(import_id):
        doc = await db.sales_imports.find_one({'id': import_id}, {'_id': 0})
        if not doc:
            raise HTTPException(status_code=404, detail='Relatório não encontrado')
        return doc

    async def build_state(doc):
        """Situação do relatório agora: ligações, plano de baixa, bloqueios e avisos."""
        lines = doc['lines']
        maps = {m['_id']: m for m in await db.sales_code_map.find(
            {'_id': {'$in': [l['code'] for l in lines]}}).to_list(None)}
        products = await db.products.find({'deleted': False}, {'_id': 0, 'id': 1, 'name': 1, 'unit': 1}).to_list(None)
        by_id = {p['id']: p for p in products}
        suggest_from = [{'id': p['id'], 'name': p.get('name', ''), 'kind': product_kind(p)} for p in products]
        pending = doc['status'] == 'pendente'

        rows, wanted = [], {}
        for line in lines:
            row = {**line, 'status': 'unmapped', 'product_id': None, 'product_name': '', 'size': None,
                   'label': '', 'suggestion': None, 'issue': None}
            m = maps.get(line['code'])
            if m and m.get('action') == 'ignore':
                row['status'] = 'ignored'
            elif m and m.get('action') == 'map' and m.get('product_id') in by_id and m.get('size') in SIZES:
                row.update(status='mapped', product_id=m['product_id'], size=m['size'], label=SIZES[m['size']]['label'],
                           product_name=by_id[m['product_id']].get('name', ''))
                quantity = line['quantity']
                if quantity <= 0:
                    row['issue'] = 'sem_baixa'          # devolução líquida: nada a baixar
                elif quantity != int(quantity):
                    row['issue'] = 'fracionada'
                else:
                    key = (m['product_id'], m['size'])
                    wanted[key] = wanted.get(key, 0) + int(quantity)
            else:
                row['suggestion'] = suggest_product(line['name'], suggest_from) if pending else None
                row['stale'] = bool(m)                  # estava ligado a um produto que não existe mais
            rows.append(row)

        if pending:
            pids = sorted({pid for pid, _ in wanted})
            lots = await db.deposit_lots.find({'product_id': {'$in': pids}, 'quantity': {'$gt': 0}}, {'_id': 0}).to_list(None) if pids else []
            plan = []
            for (pid, size), requested in sorted(
                    wanted.items(), key=lambda kv: (by_id[kv[0][0]].get('name', '').lower(), SIZES[kv[0][1]]['order'])):
                key_lots = [l for l in lots if l['product_id'] == pid and l['size'] == size]
                _, missing = plan_partial(key_lots, requested)
                plan.append({'product_id': pid, 'name': by_id[pid].get('name', ''), 'size': size,
                             'label': SIZES[size]['label'], 'requested': requested,
                             'available': sum(int(l['quantity']) for l in key_lots),
                             'deduct': requested - missing, 'shortage': missing})
        else:
            plan = [{**item, 'deduct': item['taken'], 'available': None} for item in doc.get('applied', [])]

        blocking, duplicate, overlaps = [], None, []
        if pending:
            if any(r['status'] == 'unmapped' for r in rows):
                blocking.append('unmapped')
            if any(r['issue'] == 'fracionada' for r in rows):
                blocking.append('fractional')
            if not doc.get('complete', True):
                blocking.append('incomplete')
            others = await db.sales_imports.find({'status': 'baixado', 'id': {'$ne': doc['id']}},
                                                 {'_id': 0, 'lines': 0}).to_list(None)
            duplicate = next((o for o in others if o.get('fingerprint') == doc.get('fingerprint')), None)
            if duplicate:
                blocking.append('duplicate')
            overlaps = [{'id': o['id'], 'period': o.get('period'), 'confirmed_at': o.get('confirmed_at')}
                        for o in others if o is not duplicate and periods_overlap(doc.get('period'), o.get('period'))]

        return {
            'id': doc['id'], 'status': doc['status'], 'period': doc.get('period'), 'company': doc.get('company', ''),
            'created_at': doc.get('created_at'), 'confirmed_at': doc.get('confirmed_at'),
            'confirmed_by': doc.get('confirmed_by'), 'warnings': doc.get('warnings', []),
            'file_total_quantity': doc.get('file_total_quantity'), 'lines': rows, 'plan': plan,
            'summary': {
                'lines': len(rows),
                'mapped': sum(1 for r in rows if r['status'] == 'mapped'),
                'ignored': sum(1 for r in rows if r['status'] == 'ignored'),
                'unmapped': sum(1 for r in rows if r['status'] == 'unmapped'),
                'units': sum(i['deduct'] for i in plan),
                'shortage_units': sum(i['shortage'] for i in plan),
            },
            'blocking': blocking, 'duplicate': {'id': duplicate['id'], 'confirmed_at': duplicate.get('confirmed_at')} if duplicate else None,
            'overlaps': overlaps,
        }

    # ---------- ler o PDF ----------

    @sales.post('/parse')
    async def parse(file: UploadFile = File(...), current_user=Depends(lab_user)):
        data = await file.read(MAX_PDF_BYTES + 1)
        try:
            report = await asyncio.to_thread(parse_report, data)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        cutoff = (datetime.now(timezone.utc) - PENDING_TTL).isoformat()
        await db.sales_imports.delete_many({'status': 'pendente', 'created_at': {'$lt': cutoff}})
        doc = {
            'id': str(uuid4()), 'status': 'pendente', 'created_at': now_iso(), 'created_by': who(current_user),
            'fingerprint': fingerprint(report['period'], report['lines']), 'period': report['period'],
            'company': report['company'], 'file_total_quantity': report['total_quantity'],
            'warnings': report['warnings'], 'complete': report['complete'],
            'lines': report['lines'],   # código, nome, unidade e quantidade (sem preços)
        }
        await db.sales_imports.insert_one(doc)
        doc.pop('_id', None)
        return await build_state(doc)

    @sales.get('/imports/{import_id}')
    async def get_import(import_id: str, current_user=Depends(lab_user)):
        return await build_state(await get_doc(import_id))

    @sales.delete('/imports/{import_id}')
    async def discard_import(import_id: str, current_user=Depends(lab_user)):
        result = await db.sales_imports.delete_one({'id': import_id, 'status': 'pendente'})
        if result.deleted_count != 1:
            raise HTTPException(status_code=400, detail='Só relatórios ainda não baixados podem ser descartados')
        return {'message': 'Relatório descartado'}

    # ---------- ligação código GigaMob -> produto ----------

    @sales.get('/codes')
    async def list_codes(current_user=Depends(lab_user)):
        rows = await db.sales_code_map.find({}).to_list(None)
        return [{'code': r['_id'], 'action': r.get('action'), 'product_id': r.get('product_id'),
                 'size': r.get('size'), 'name': r.get('name', '')} for r in rows]

    @sales.put('/codes')
    async def save_codes(data: CodesSave, current_user=Depends(lab_user)):
        ids = {i.product_id for i in data.items if i.action == 'map'}
        found = {p['id']: p for p in await db.products.find(
            {'id': {'$in': list(ids)}, 'deleted': False}, {'_id': 0, 'id': 1, 'unit': 1, 'name': 1}).to_list(None)}
        for item in data.items:
            if item.action not in ('map', 'ignore', 'clear'):
                raise HTTPException(status_code=400, detail='Ação inválida')
            if item.action == 'map':
                product = found.get(item.product_id)
                if not product:
                    raise HTTPException(status_code=404, detail=f'Produto não encontrado para o código {item.code}')
                if item.size not in SIZES or SIZES[item.size]['kind'] != product_kind(product):
                    raise HTTPException(status_code=400, detail=f"Tamanho inválido para {product.get('name')} (código {item.code})")
        for item in data.items:
            code = item.code.strip()
            if item.action == 'clear':
                await db.sales_code_map.delete_one({'_id': code})
                continue
            fields = {'action': item.action, 'name': item.name[:120], 'updated_at': now_iso(), 'updated_by': who(current_user),
                      'product_id': item.product_id if item.action == 'map' else None,
                      'size': item.size if item.action == 'map' else None}
            await db.sales_code_map.update_one({'_id': code}, {'$set': fields}, upsert=True)
        return {'saved': len(data.items)}

    # ---------- baixar ----------

    @sales.post('/imports/{import_id}/confirm')
    async def confirm_import(import_id: str, data: ConfirmData, current_user=Depends(lab_user)):
        doc = await get_doc(import_id)
        if doc['status'] != 'pendente':
            raise HTTPException(status_code=400, detail='Este relatório já foi baixado ou cancelado')
        state = await build_state(doc)
        if state['blocking']:
            raise HTTPException(status_code=400, detail=' '.join(BLOCK_MESSAGES[b] for b in state['blocking']))
        if state['overlaps'] and not data.allow_overlap:
            raise HTTPException(status_code=409, detail=(
                'O período deste relatório se sobrepõe a um já baixado. Se baixar, as mesmas vendas podem sair duas vezes. '
                'Confirme que quer continuar.'))
        claimed = await db.sales_imports.update_one({'id': import_id, 'status': 'pendente'}, {'$set': {'status': 'baixando'}})
        if claimed.matched_count != 1:
            raise HTTPException(status_code=409, detail='Este relatório está sendo baixado. Aguarde')

        operator = (data.operator or '').strip() or who(current_user)
        debited, applied = [], []
        try:
            async with product_lock(sorted({i['product_id'] for i in state['plan']})):
                for item in state['plan']:
                    lots = await db.deposit_lots.find(
                        {'product_id': item['product_id'], 'size': item['size'], 'quantity': {'$gt': 0}}, {'_id': 0}).to_list(None)
                    allocations, missing = plan_partial(lots, item['requested'])
                    taken = item['requested'] - missing
                    if taken > 0:
                        for a in allocations:
                            await db.deposit_lots.update_one(
                                {'id': a['lot_id']}, {'$inc': {'quantity': -a['quantity']}, '$set': {'updated_at': now_iso()}})
                        debited.append(allocations)
                        await db.deposit_movements.insert_one({
                            'id': str(uuid4()), 'type': 'saida', 'origin': 'venda', 'import_id': import_id,
                            'product_id': item['product_id'], 'product_name': item['name'], 'size': item['size'],
                            'size_label': item['label'], 'quantity': taken, 'requested': item['requested'],
                            'shortage': missing, 'batch_id': None,
                            'batch_number': ', '.join(a['batch_number'] for a in allocations),
                            'allocations': allocations, 'operator': operator,
                            'note': f"Venda GigaMob {period_text(doc.get('period'))}", 'created_by': who(current_user),
                            'created_at': now_iso(), 'cancelled': False,
                        })
                    applied.append({'product_id': item['product_id'], 'name': item['name'], 'size': item['size'],
                                    'label': item['label'], 'requested': item['requested'], 'taken': taken, 'shortage': missing})
                summary = {'units': sum(a['taken'] for a in applied), 'shortage_units': sum(a['shortage'] for a in applied)}
                await db.sales_imports.update_one({'id': import_id}, {'$set': {
                    'status': 'baixado', 'applied': applied, 'summary': summary,
                    'shortages': [a for a in applied if a['shortage'] > 0],
                    'confirmed_at': now_iso(), 'confirmed_by': operator}})
        except Exception:
            # Desfaz o que já tinha saído para não baixar duas vezes numa nova tentativa.
            for allocations in debited:
                for a in allocations:
                    await db.deposit_lots.update_one({'id': a['lot_id']}, {'$inc': {'quantity': a['quantity']}})
            await db.deposit_movements.delete_many({'import_id': import_id})
            await db.sales_imports.update_one({'id': import_id, 'status': {'$ne': 'baixado'}}, {'$set': {'status': 'pendente'}})
            raise
        return await build_state(await get_doc(import_id))

    @sales.post('/imports/{import_id}/cancel')
    async def cancel_import(import_id: str, current_user=Depends(lab_user)):
        """Desfaz uma importação inteira: as unidades voltam para o Depósito."""
        doc = await get_doc(import_id)
        if doc['status'] != 'baixado':
            raise HTTPException(status_code=400, detail='Só relatórios já baixados podem ser desfeitos')
        claimed = await db.sales_imports.update_one({'id': import_id, 'status': 'baixado'}, {'$set': {'status': 'cancelando'}})
        if claimed.matched_count != 1:
            raise HTTPException(status_code=409, detail='Este relatório está sendo alterado. Aguarde')
        try:
            moves = await db.deposit_movements.find(
                {'import_id': import_id, 'type': 'saida', 'cancelled': {'$ne': True}}, {'_id': 0}).to_list(None)
            async with product_lock(sorted({m['product_id'] for m in moves})):
                for move in moves:
                    for a in move['allocations']:
                        await db.deposit_lots.update_one(
                            {'id': a['lot_id']}, {'$inc': {'quantity': a['quantity']}, '$set': {'updated_at': now_iso()}})
                    await db.deposit_movements.update_one({'id': move['id']}, {'$set': {
                        'cancelled': True, 'cancelled_at': now_iso(), 'cancelled_by': who(current_user)}})
        except Exception:
            await db.sales_imports.update_one({'id': import_id, 'status': 'cancelando'}, {'$set': {'status': 'baixado'}})
            raise
        await db.sales_imports.update_one({'id': import_id}, {'$set': {
            'status': 'cancelado', 'cancelled_at': now_iso(), 'cancelled_by': who(current_user)}})
        return {'message': 'Baixa desfeita. As unidades voltaram para o Depósito'}

    @sales.get('/imports')
    async def history(current_user=Depends(lab_user)):
        docs = await db.sales_imports.find(
            {'status': {'$in': ['baixado', 'cancelado']}}, {'_id': 0, 'lines': 0}).sort('created_at', -1).to_list(30)
        return [{'id': d['id'], 'status': d['status'], 'period': d.get('period'), 'created_at': d.get('created_at'),
                 'confirmed_at': d.get('confirmed_at'), 'confirmed_by': d.get('confirmed_by'),
                 'summary': d.get('summary', {}), 'shortages': d.get('shortages', [])} for d in docs]

    router.include_router(sales)
