"""Estoque de produto acabado (garrafas prontas).

Coleções novas, nenhuma coleção existente é alterada:
  finished_stock_lots       saldo por produto + tamanho + lote
  finished_stock_movements  histórico de entradas, saídas e estornos
  finished_stock_lists      listas de gestão (estoque -> depósito)
  finished_stock_locks      trava curta por produto durante uma movimentação
  product_barcodes          código de barras -> produto + tamanho

Nos produtos só são gravados dois campos opcionais novos:
  stock_sizes     tamanhos que o produto possui (ex.: ['one_liter', 'five_liter'])
  stock_minimums  quantidade mínima por tamanho (ex.: {'one_liter': 10})
"""
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

# Mesmos campos usados pela Contagem, para casar com o que foi envasado.
SIZES = {
    'half_liter': {'label': '500ml', 'kind': 'L', 'order': 1},
    'one_liter': {'label': '1L', 'kind': 'L', 'order': 2},
    'two_liter': {'label': '2L', 'kind': 'L', 'order': 3},
    'five_liter': {'label': '5L', 'kind': 'L', 'order': 4},
    'three_thirty_gram': {'label': '330g', 'kind': 'Kg', 'order': 5},
    'five_hundred_gram': {'label': '500g', 'kind': 'Kg', 'order': 6},
    'one_kg': {'label': '1Kg', 'kind': 'Kg', 'order': 7},
}
MIXED = 'misturado'  # lote desconhecido / lotes misturados (inventário inicial)
LOCK_TIMEOUT = timedelta(seconds=60)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def product_kind(product):
    unit = (product.get('unit') or 'L').lower()
    return 'Kg' if ('kg' in unit or 'g' in unit or 'quilo' in unit) else 'L'


def product_sizes(product):
    """Tamanhos configurados; sem configuração, todos os do tipo do produto."""
    kind = product_kind(product)
    configured = [s for s in (product.get('stock_sizes') or []) if s in SIZES and SIZES[s]['kind'] == kind]
    if configured:
        return sorted(set(configured), key=lambda s: SIZES[s]['order'])
    return [s for s in sorted(SIZES, key=lambda s: SIZES[s]['order']) if SIZES[s]['kind'] == kind]


def counted_by_size(countings):
    totals = {size: 0 for size in SIZES}
    for count in countings or []:
        for size in SIZES:
            totals[size] += int(count.get(size) or 0)
    return totals


def plan_exit(lots, quantity):
    """Retira primeiro do lote mais antigo; lotes misturados (inventário) saem antes."""
    ordered = sorted(
        (lot for lot in lots if lot.get('quantity', 0) > 0),
        key=lambda lot: (lot.get('batch_id') is not None, lot.get('batch_date') or '', lot.get('batch_number') or ''),
    )
    remaining, allocations = quantity, []
    for lot in ordered:
        if remaining <= 0:
            break
        take = min(int(lot['quantity']), remaining)
        allocations.append({'lot_id': lot['id'], 'batch_id': lot.get('batch_id'),
                            'batch_number': lot.get('batch_number') or MIXED, 'quantity': take})
        remaining -= take
    if remaining > 0:
        raise ValueError(f'Estoque insuficiente: disponível {quantity - remaining}, pedido {quantity}')
    return allocations


def low_stock_message(product_name, size, after, minimum):
    label = SIZES[size]['label']
    unidades = 'unidade' if after == 1 else 'unidades'
    return (f'{product_name} {label}: apenas {after} {unidades} no estoque (mínimo {minimum}). '
            'Necessita nova ordem de produção.')


def internal_code(product_id, size):
    """Código interno para produto+tamanho sem código cadastrado (ex.: LX2A1B2C3D4E5)."""
    return 'LX' + str(SIZES[size]['order']) + product_id.replace('-', '')[:10].upper()


def parse_internal_code(code):
    """Retorna (prefixo do produto, tamanho) de um código LX, ou None."""
    code = (code or '').strip().upper()
    if not (4 <= len(code) <= 13) or not code.startswith('LX') or not code[2].isdigit():
        return None
    size = next((k for k, v in SIZES.items() if v['order'] == int(code[2])), None)
    return (code[3:], size) if size else None


def should_notify(before, after, minimum):
    return minimum > 0 and after <= minimum < before


# ========== MODELOS ==========

class EntryCreate(BaseModel):
    product_id: str
    size: str
    quantity: int = Field(gt=0, le=1_000_000)
    batch_id: Optional[str] = None
    mode: str = 'normal'  # normal (limitado pela Contagem) | inventario (sem limite, lote opcional)
    operator: str = ''
    note: str = ''


class ExitItem(BaseModel):
    product_id: str
    size: str
    quantity: int = Field(gt=0, le=1_000_000)


class ExitCreate(BaseModel):
    items: List[ExitItem] = Field(min_length=1, max_length=200)
    operator: str = ''
    note: str = ''


class ListCreate(BaseModel):
    items: List[ExitItem] = Field(min_length=1, max_length=200)
    note: str = ''


class ListConfirm(BaseModel):
    operator: str = ''


class ProductStockConfig(BaseModel):
    sizes: List[str] = Field(default_factory=list)
    minimums: Dict[str, int] = Field(default_factory=dict)


class MinimumUpdate(BaseModel):
    product_id: str
    minimums: Dict[str, int] = Field(default_factory=dict)  # 0 remove o mínimo
    add_sizes: List[str] = Field(default_factory=list)       # marca o tamanho como "Tem"
    set_sizes: Optional[List[str]] = None                    # define exatamente os tamanhos que o produto tem


class MinimumsBulk(BaseModel):
    updates: List[MinimumUpdate] = Field(min_length=1, max_length=2000)


def merge_minimums(product, update):
    """Mescla mínimos e tamanhos de um produto; ignora tamanhos de outra unidade.

    Retorna (stock_sizes, stock_minimums, ignorados).
    """
    kind = product_kind(product)
    fits = lambda s: s in SIZES and SIZES[s]['kind'] == kind
    for value in update.minimums.values():
        if value < 0:
            raise ValueError('Quantidade mínima não pode ser negativa')
    ignored = sorted({s for s in list(update.minimums) + update.add_sizes + (update.set_sizes or []) if not fits(s)})
    sizes = [s for s in (product.get('stock_sizes') or []) if fits(s)]
    minimums = {k: int(v) for k, v in (product.get('stock_minimums') or {}).items() if fits(k)}
    if update.set_sizes is not None:
        sizes = sorted({s for s in update.set_sizes if fits(s)}, key=lambda s: SIZES[s]['order'])
        if not sizes:
            raise ValueError('nenhum dos tamanhos escolhidos serve para a unidade deste produto')
        minimums = {k: v for k, v in minimums.items() if k in sizes}
    for size, value in update.minimums.items():
        if not fits(size):
            continue
        if value > 0:
            minimums[size] = int(value)
        else:
            minimums.pop(size, None)
    added = [s for s in update.add_sizes if fits(s)]
    added += [s for s, v in update.minimums.items() if fits(s) and v > 0]
    # Produto sem tamanhos definidos mostra todos: o mínimo não deve esconder os demais.
    if added and sizes:
        sizes = sorted(set(sizes) | set(added), key=lambda s: SIZES[s]['order'])
    return sizes, minimums, ignored


class BarcodeSet(BaseModel):
    product_id: str
    size: str
    code: str = ''  # vazio remove


def setup_finished_stock_routes(api_router: APIRouter, db, get_current_user, broadcast_push):
    router = APIRouter(prefix='/finished-stock')

    # ---------- utilidades ----------

    @asynccontextmanager
    async def product_lock(product_ids):
        owner, held = str(uuid4()), []
        try:
            for pid in sorted(set(product_ids)):
                for attempt in range(2):
                    try:
                        await db.finished_stock_locks.insert_one({'_id': pid, 'owner': owner, 'at': now_iso()})
                        held.append(pid)
                        break
                    except DuplicateKeyError:
                        current = await db.finished_stock_locks.find_one({'_id': pid}) or {}
                        stale = current.get('at', '') < (datetime.now(timezone.utc) - LOCK_TIMEOUT).isoformat()
                        if attempt == 0 and stale:
                            await db.finished_stock_locks.delete_one({'_id': pid, 'owner': current.get('owner')})
                            continue
                        raise HTTPException(status_code=409, detail='Outra movimentação deste produto está em andamento. Tente novamente')
            yield
        finally:
            for pid in held:
                await db.finished_stock_locks.delete_one({'_id': pid, 'owner': owner})

    async def get_product(product_id):
        product = await db.products.find_one({'id': product_id, 'deleted': False}, {'_id': 0})
        if not product:
            raise HTTPException(status_code=404, detail='Produto não encontrado')
        return product

    def check_size(product, size):
        if size not in SIZES:
            raise HTTPException(status_code=400, detail='Tamanho inválido')
        if size not in product_sizes(product):
            raise HTTPException(status_code=400, detail=f"{product.get('name', 'Produto')} não possui o tamanho {SIZES[size]['label']}")

    async def check_size_or_stock(product, size):
        """Saída/lista: aceita tamanho desmarcado se ainda houver unidades dele no estoque."""
        if size in SIZES and size not in product_sizes(product) and await size_total(product['id'], size) > 0:
            return
        check_size(product, size)

    async def find_batch(product_id, batch_id):
        """Lote ativo ou arquivado do produto, com as garrafas contadas por tamanho."""
        batch = await db.product_batches.find_one({'id': batch_id, 'product_id': product_id, 'deleted': False}, {'_id': 0})
        if batch:
            countings = await db.counting.find({'product_batch_id': batch_id}, {'_id': 0}).to_list(None)
            return batch, counted_by_size(countings), batch.get('status', '')
        batch = await db.archived_product_batches.find_one({'id': batch_id, 'product_id': product_id}, {'_id': 0})
        if batch:
            return batch, counted_by_size(batch.get('countings_history')), 'arquivado'
        return None, None, None

    async def entered_normal(product_id, size, batch_id):
        rows = await db.finished_stock_movements.find({
            'type': 'entrada', 'mode': 'normal', 'cancelled': {'$ne': True},
            'product_id': product_id, 'size': size, 'batch_id': batch_id,
        }, {'_id': 0, 'quantity': 1}).to_list(None)
        return sum(int(r.get('quantity', 0)) for r in rows)

    async def size_total(product_id, size):
        lots = await db.finished_stock_lots.find({'product_id': product_id, 'size': size}, {'_id': 0}).to_list(None)
        return sum(int(lot.get('quantity', 0)) for lot in lots)

    def operator_name(data_operator, user):
        return (data_operator or '').strip() or user.get('name') or user.get('email', '')

    async def notify_low(product, size, before, after, background):
        minimum = int((product.get('stock_minimums') or {}).get(size, 0) or 0)
        if not should_notify(before, after, minimum):
            return None
        doc = {
            'id': str(uuid4()),
            'product_name': f"{product.get('name', '')} {SIZES[size]['label']}",
            'message': low_stock_message(product.get('name', ''), size, after, minimum),
            'created_by': 'Estoque (automático)',
            'created_at': now_iso(),
            'deleted': False,
            'source': 'finished_stock',
        }
        await db.notifications.insert_one(doc)
        doc.pop('_id', None)
        background.add_task(broadcast_push, 'Lumix — Estoque mínimo', doc['message'], '/notificar')
        return doc

    async def apply_exits(items, operator, note, user, background, list_id=None):
        grouped = {}
        for item in items:
            key = (item.product_id, item.size)
            grouped[key] = grouped.get(key, 0) + item.quantity
        async with product_lock([pid for pid, _ in grouped]):
            plans = []
            for (pid, size), qty in grouped.items():
                product = await get_product(pid)
                await check_size_or_stock(product, size)
                lots = await db.finished_stock_lots.find({'product_id': pid, 'size': size}, {'_id': 0}).to_list(None)
                try:
                    allocations = plan_exit(lots, qty)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=f"{product.get('name')} {SIZES[size]['label']}: {exc}")
                before = sum(int(lot.get('quantity', 0)) for lot in lots)
                plans.append((product, size, qty, allocations, before))
            # Tudo validado: só agora grava.
            movements, notifications = [], []
            for product, size, qty, allocations, before in plans:
                for alloc in allocations:
                    await db.finished_stock_lots.update_one(
                        {'id': alloc['lot_id']}, {'$inc': {'quantity': -alloc['quantity']}, '$set': {'updated_at': now_iso()}})
                movement = {
                    'id': str(uuid4()), 'type': 'saida', 'mode': 'normal',
                    'product_id': product['id'], 'product_name': product.get('name', ''),
                    'size': size, 'size_label': SIZES[size]['label'], 'quantity': qty,
                    'batch_id': None, 'batch_number': ', '.join(a['batch_number'] for a in allocations),
                    'allocations': allocations, 'operator': operator, 'note': note.strip(),
                    'list_id': list_id, 'created_by': user.get('name') or user.get('email', ''),
                    'created_at': now_iso(), 'cancelled': False,
                }
                await db.finished_stock_movements.insert_one(movement)
                movement.pop('_id', None)
                movements.append(movement)
                after = before - qty
                notice = await notify_low(product, size, before, after, background)
                if notice:
                    notifications.append(notice)
        return {'movements': movements, 'notifications': notifications}

    # ---------- consulta ----------

    @router.get('/overview')
    async def overview(current_user=Depends(get_current_user)):
        products = await db.products.find({'deleted': False}, {'_id': 0, 'recipes': 0, 'file_models': 0}).to_list(None)
        lots = await db.finished_stock_lots.find({'quantity': {'$gt': 0}}, {'_id': 0}).to_list(None)
        codes = await db.product_barcodes.find({}, {'_id': 1, 'product_id': 1, 'size': 1}).to_list(None)
        by_key, code_map = {}, {}
        for lot in lots:
            by_key.setdefault((lot['product_id'], lot['size']), []).append(lot)
        for c in codes:
            code_map[(c['product_id'], c['size'])] = c['_id']
        result = []
        for product in sorted(products, key=lambda p: (p.get('name') or '').lower()):
            minimums = product.get('stock_minimums') or {}
            sizes = []
            shown = set(product_sizes(product)) | {
                size for (pid, size), rows in by_key.items()
                if pid == product['id'] and size in SIZES and sum(int(r['quantity']) for r in rows) > 0}
            for size in sorted(shown, key=lambda s: SIZES[s]['order']):
                size_lots = sorted(by_key.get((product['id'], size), []),
                                   key=lambda lot: (lot.get('batch_id') is not None, lot.get('batch_date') or ''))
                total = sum(int(lot['quantity']) for lot in size_lots)
                minimum = int(minimums.get(size, 0) or 0)
                sizes.append({
                    'size': size, 'label': SIZES[size]['label'], 'quantity': total, 'minimum': minimum,
                    'unlisted': size not in product_sizes(product),
                    'low': minimum > 0 and total <= minimum,
                    'barcode': code_map.get((product['id'], size), ''),
                    'internal_code': internal_code(product['id'], size),
                    'lots': [{'batch_id': lot.get('batch_id'), 'batch_number': lot.get('batch_number') or MIXED,
                              'quantity': int(lot['quantity'])} for lot in size_lots],
                })
            result.append({'product_id': product['id'], 'name': product.get('name', ''),
                           'kind': product_kind(product), 'configured': bool(product.get('stock_sizes')),
                           'stock_sizes': product.get('stock_sizes') or [],
                           'minimums': {k: int(v) for k, v in minimums.items() if k in SIZES},
                           'sizes': sizes})
        return {'sizes': [{'size': k, **v} for k, v in sorted(SIZES.items(), key=lambda kv: kv[1]['order'])],
                'products': result}

    @router.get('/products/{product_id}/batches')
    async def product_batches(product_id: str, size: Optional[str] = None, current_user=Depends(get_current_user)):
        product = await get_product(product_id)
        active = await db.product_batches.find({'product_id': product_id, 'deleted': False}, {'_id': 0}).to_list(None)
        archived = await db.archived_product_batches.find({'product_id': product_id}, {'_id': 0}).to_list(None)
        active_ids = [b['id'] for b in active]
        countings = await db.counting.find({'product_batch_id': {'$in': active_ids}}, {'_id': 0}).to_list(None) if active_ids else []
        by_batch = {}
        for c in countings:
            by_batch.setdefault(c['product_batch_id'], []).append(c)
        entries = await db.finished_stock_movements.find({
            'type': 'entrada', 'mode': 'normal', 'cancelled': {'$ne': True}, 'product_id': product_id,
        }, {'_id': 0, 'batch_id': 1, 'size': 1, 'quantity': 1}).to_list(None)
        entered = {}
        for e in entries:
            entered[(e['batch_id'], e['size'])] = entered.get((e['batch_id'], e['size']), 0) + int(e['quantity'])
        rows = []
        for batch, counted, status in (
            [(b, counted_by_size(by_batch.get(b['id'])), b.get('status', '')) for b in active] +
            [(b, counted_by_size(b.get('countings_history')), 'arquivado') for b in archived]
        ):
            per_size = {}
            for s in product_sizes(product):
                done = entered.get((batch['id'], s), 0)
                per_size[s] = {'counted': counted[s], 'entered': done, 'available': max(counted[s] - done, 0)}
            rows.append({'batch_id': batch['id'], 'batch_number': batch.get('batch_number', ''),
                         'date': batch.get('date', ''), 'status': status, 'sizes': per_size})
        if size:
            rows = [r for r in rows if size in r['sizes']]
        rows.sort(key=lambda r: (r['date'], r['batch_number']), reverse=True)
        return rows

    @router.get('/movements')
    async def movements(product_id: Optional[str] = None, limit: int = 100, current_user=Depends(get_current_user)):
        query = {'product_id': product_id} if product_id else {}
        limit = max(1, min(limit, 500))
        return await db.finished_stock_movements.find(query, {'_id': 0}).sort('created_at', -1).to_list(limit)

    @router.get('/barcode/{code}')
    async def lookup_barcode(code: str, current_user=Depends(get_current_user)):
        found = await db.product_barcodes.find_one({'_id': code.strip()})
        if not found and parse_internal_code(code):
            prefix, size = parse_internal_code(code)
            matches = [p for p in await db.products.find({'deleted': False}, {'_id': 0, 'id': 1}).to_list(None)
                       if p['id'].replace('-', '')[:10].upper() == prefix]
            if len(matches) == 1:
                found = {'_id': code.strip().upper(), 'product_id': matches[0]['id'], 'size': size}
        if not found:
            raise HTTPException(status_code=404, detail='Código de barras não cadastrado')
        product = await get_product(found['product_id'])
        return {'code': found['_id'], 'product_id': product['id'], 'name': product.get('name', ''),
                'size': found['size'], 'label': SIZES.get(found['size'], {}).get('label', '')}

    # ---------- movimentações ----------

    @router.post('/entries')
    async def create_entry(data: EntryCreate, current_user=Depends(get_current_user)):
        if data.mode not in ('normal', 'inventario'):
            raise HTTPException(status_code=400, detail='Modo inválido')
        product = await get_product(data.product_id)
        check_size(product, data.size)
        batch, batch_number, batch_date = None, MIXED, ''
        if data.batch_id:
            batch, counted, _ = await find_batch(data.product_id, data.batch_id)
            if not batch:
                raise HTTPException(status_code=404, detail='Lote não encontrado para este produto')
            batch_number, batch_date = batch.get('batch_number', ''), batch.get('date', '')
        elif data.mode == 'normal':
            raise HTTPException(status_code=400, detail='Selecione o lote')
        async with product_lock([data.product_id]):
            if data.mode == 'normal':
                done = await entered_normal(data.product_id, data.size, data.batch_id)
                available = counted[data.size] - done
                if data.quantity > available:
                    raise HTTPException(status_code=400, detail=(
                        f"O lote {batch_number} tem {counted[data.size]} unidades de {SIZES[data.size]['label']} na Contagem "
                        f"e {done} já entraram no estoque. Disponível: {max(available, 0)}"))
            batch_key = data.batch_id or MIXED
            lot_id = f'{data.product_id}:{data.size}:{batch_key}'
            await db.finished_stock_lots.update_one(
                {'id': lot_id},
                {'$inc': {'quantity': data.quantity},
                 '$set': {'updated_at': now_iso(), 'batch_number': batch_number, 'batch_date': batch_date},
                 '$setOnInsert': {'product_id': data.product_id, 'size': data.size,
                                  'batch_id': data.batch_id, 'created_at': now_iso()}},
                upsert=True,
            )
            movement = {
                'id': str(uuid4()), 'type': 'entrada', 'mode': data.mode,
                'product_id': product['id'], 'product_name': product.get('name', ''),
                'size': data.size, 'size_label': SIZES[data.size]['label'], 'quantity': data.quantity,
                'batch_id': data.batch_id, 'batch_number': batch_number,
                'allocations': [{'lot_id': lot_id, 'batch_id': data.batch_id, 'batch_number': batch_number, 'quantity': data.quantity}],
                'operator': operator_name(data.operator, current_user), 'note': data.note.strip(), 'list_id': None,
                'created_by': current_user.get('name') or current_user.get('email', ''),
                'created_at': now_iso(), 'cancelled': False,
            }
            await db.finished_stock_movements.insert_one(movement)
            movement.pop('_id', None)
        return movement

    @router.post('/exits')
    async def create_exit(data: ExitCreate, background: BackgroundTasks, current_user=Depends(get_current_user)):
        return await apply_exits(data.items, operator_name(data.operator, current_user), data.note, current_user, background)

    @router.post('/movements/{movement_id}/cancel')
    async def cancel_movement(movement_id: str, current_user=Depends(get_current_user)):
        movement = await db.finished_stock_movements.find_one({'id': movement_id}, {'_id': 0})
        if not movement:
            raise HTTPException(status_code=404, detail='Movimentação não encontrada')
        async with product_lock([movement['product_id']]):
            movement = await db.finished_stock_movements.find_one({'id': movement_id}, {'_id': 0})
            if movement.get('cancelled'):
                raise HTTPException(status_code=400, detail='Esta movimentação já foi estornada')
            sign = -1 if movement['type'] == 'entrada' else 1
            if sign < 0:
                for alloc in movement['allocations']:
                    lot = await db.finished_stock_lots.find_one({'id': alloc['lot_id']}, {'_id': 0}) or {}
                    if int(lot.get('quantity', 0)) < alloc['quantity']:
                        raise HTTPException(status_code=400, detail=(
                            'Não é possível estornar: parte dessas unidades já saiu do estoque. Estorne a saída primeiro'))
            for alloc in movement['allocations']:
                await db.finished_stock_lots.update_one(
                    {'id': alloc['lot_id']}, {'$inc': {'quantity': sign * alloc['quantity']}, '$set': {'updated_at': now_iso()}})
            await db.finished_stock_movements.update_one({'id': movement_id}, {'$set': {
                'cancelled': True, 'cancelled_at': now_iso(),
                'cancelled_by': current_user.get('name') or current_user.get('email', '')}})
        return {'message': 'Movimentação estornada'}

    # ---------- lista de gestão (estoque -> depósito) ----------

    @router.get('/lists')
    async def get_lists(current_user=Depends(get_current_user)):
        return await db.finished_stock_lists.find({'status': {'$ne': 'cancelada'}}, {'_id': 0}).sort('created_at', -1).to_list(50)

    @router.post('/lists')
    async def create_list(data: ListCreate, current_user=Depends(get_current_user)):
        items = []
        for item in data.items:
            product = await get_product(item.product_id)
            await check_size_or_stock(product, item.size)
            items.append({'product_id': product['id'], 'name': product.get('name', ''), 'size': item.size,
                          'label': SIZES[item.size]['label'], 'quantity': item.quantity})
        doc = {'id': str(uuid4()), 'items': items, 'note': data.note.strip(), 'status': 'pendente',
               'created_by': current_user.get('name') or current_user.get('email', ''), 'created_at': now_iso()}
        await db.finished_stock_lists.insert_one(doc)
        doc.pop('_id', None)
        return doc

    @router.post('/lists/{list_id}/confirm')
    async def confirm_list(list_id: str, data: ListConfirm, background: BackgroundTasks, current_user=Depends(get_current_user)):
        claimed = await db.finished_stock_lists.update_one(
            {'id': list_id, 'status': 'pendente'}, {'$set': {'status': 'confirmando'}})
        if claimed.matched_count != 1:
            raise HTTPException(status_code=400, detail='Lista não encontrada ou já confirmada')
        lst = await db.finished_stock_lists.find_one({'id': list_id}, {'_id': 0})
        try:
            result = await apply_exits([ExitItem(**i) for i in lst['items']], operator_name(data.operator, current_user),
                                       f'Lista de gestão {list_id[:8]}', current_user, background, list_id=list_id)
        except Exception:
            await db.finished_stock_lists.update_one({'id': list_id}, {'$set': {'status': 'pendente'}})
            raise
        await db.finished_stock_lists.update_one({'id': list_id}, {'$set': {
            'status': 'confirmada', 'confirmed_at': now_iso(),
            'confirmed_by': operator_name(data.operator, current_user)}})
        return result

    @router.delete('/lists/{list_id}')
    async def cancel_list(list_id: str, current_user=Depends(get_current_user)):
        result = await db.finished_stock_lists.update_one(
            {'id': list_id, 'status': 'pendente'}, {'$set': {'status': 'cancelada'}})
        if result.matched_count != 1:
            raise HTTPException(status_code=400, detail='Só listas pendentes podem ser canceladas')
        return {'message': 'Lista cancelada'}

    # ---------- configuração ----------

    @router.put('/products/{product_id}/config')
    async def set_config(product_id: str, data: ProductStockConfig, current_user=Depends(get_current_user)):
        product = await get_product(product_id)
        kind = product_kind(product)
        sizes = [s for s in data.sizes if s in SIZES]
        if any(SIZES[s]['kind'] != kind for s in sizes):
            raise HTTPException(status_code=400, detail='Tamanho incompatível com a unidade do produto')
        minimums = {}
        for size, value in data.minimums.items():
            if size in SIZES and SIZES[size]['kind'] == kind:
                if value < 0:
                    raise HTTPException(status_code=400, detail='Quantidade mínima não pode ser negativa')
                minimums[size] = int(value)
        await db.products.update_one({'id': product_id}, {'$set': {
            'stock_sizes': sorted(set(sizes), key=lambda s: SIZES[s]['order']), 'stock_minimums': minimums}})
        return {'stock_sizes': sizes, 'stock_minimums': minimums}

    @router.put('/minimums/bulk')
    async def set_minimums_bulk(data: MinimumsBulk, current_user=Depends(get_current_user)):
        """Mínimos de vários produtos de uma vez (valida tudo antes de gravar)."""
        ids = [u.product_id for u in data.updates]
        if len(set(ids)) != len(ids):
            raise HTTPException(status_code=400, detail='Produto repetido na lista')
        products = {p['id']: p for p in await db.products.find(
            {'id': {'$in': ids}, 'deleted': False}, {'_id': 0, 'id': 1, 'name': 1, 'unit': 1,
                                                     'stock_sizes': 1, 'stock_minimums': 1}).to_list(None)}
        missing = [pid for pid in ids if pid not in products]
        if missing:
            raise HTTPException(status_code=404, detail=f'{len(missing)} produto(s) não encontrado(s). Atualize a página')
        plans, skipped = [], []
        for update in data.updates:
            product = products[update.product_id]
            try:
                sizes, minimums, ignored = merge_minimums(product, update)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=f"{product.get('name')}: {exc}")
            if ignored:
                skipped.append({'product_id': product['id'], 'name': product.get('name', ''),
                                'sizes': [SIZES[s]['label'] if s in SIZES else s for s in ignored]})
            plans.append((product['id'], sizes, minimums))
        for pid, sizes, minimums in plans:
            await db.products.update_one({'id': pid}, {'$set': {'stock_sizes': sizes, 'stock_minimums': minimums}})
        return {'updated': len(plans), 'skipped': skipped}

    @router.get('/barcodes')
    async def list_barcodes(current_user=Depends(get_current_user)):
        rows = await db.product_barcodes.find({}).to_list(None)
        return [{'code': r['_id'], 'product_id': r['product_id'], 'size': r['size']} for r in rows]

    @router.put('/barcodes')
    async def set_barcode(data: BarcodeSet, current_user=Depends(get_current_user)):
        product = await get_product(data.product_id)
        if data.size not in SIZES or SIZES[data.size]['kind'] != product_kind(product):
            raise HTTPException(status_code=400, detail='Tamanho inválido para este produto')
        code = data.code.strip()
        if code:
            existing = await db.product_barcodes.find_one({'_id': code})
            if existing and (existing['product_id'], existing['size']) != (data.product_id, data.size):
                other = await db.products.find_one({'id': existing['product_id']}, {'_id': 0, 'name': 1}) or {}
                raise HTTPException(status_code=400, detail=(
                    f"Este código já está em {other.get('name', 'outro produto')} {SIZES.get(existing['size'], {}).get('label', '')}"))
        await db.product_barcodes.delete_many({'product_id': data.product_id, 'size': data.size})
        if code:
            await db.product_barcodes.insert_one({'_id': code, 'product_id': data.product_id, 'size': data.size,
                                                  'updated_at': now_iso()})
        return {'code': code, 'product_id': data.product_id, 'size': data.size}

    api_router.include_router(router)
