"""Exclusão mútua das movimentações entre processos, sem depender de replica set."""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from functools import wraps
from uuid import uuid4

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError


_active = ContextVar('stock_write_control', default=None)


def current_stock_operation():
    return _active.get()


@asynccontextmanager
async def stock_write_lock(db):
    current = _active.get()
    if current is not None and current['db'] is db:
        yield
        return
    owner = str(uuid4())
    try:
        await db.stock_control.update_one(
            {'_id': 'inventory', 'owner': None},
            {'$set': {'owner': owner, 'started_at': datetime.now(timezone.utc).isoformat()},
             '$setOnInsert': {'revision': 0}}, upsert=True,
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Há uma movimentação de estoque em andamento ou pendente de conferência. Aguarde; se persistir, confira a última operação')
    state = {'db': db, 'owner': owner, 'retain': False}
    token = _active.set(state)
    try:
        yield
    except Exception as exc:
        # Falhas de validação são controladas. Numa falha inesperada de banco,
        # manter o bloqueio impede repetir créditos até conferir a operação.
        if not isinstance(exc, (HTTPException, ValueError)):
            state['retain'] = True
        raise
    finally:
        try:
            if not state['retain']:
                await db.stock_control.update_one(
                    {'_id': 'inventory', 'owner': owner},
                    {'$set': {'owner': None}, '$inc': {'revision': 1}},
                )
        finally:
            _active.reset(token)


def serialized_stock_write(get_db):
    def decorate(function):
        @wraps(function)
        async def wrapped(*args, **kwargs):
            async with stock_write_lock(get_db()):
                return await function(*args, **kwargs)
        return wrapped
    return decorate
