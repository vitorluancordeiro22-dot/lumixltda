from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Body, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from uuid import uuid4
import uuid
import io
import re
import json
import asyncio
from bson import ObjectId

# Industrial OP imports
from industrial_op import (
    OPStatus, FileType, FileMetadata, ProductFileModels,
    RawMaterialUsage, OPHistoryEntry, IndustrialOP,
    IndustrialOPCreate, IndustrialOPUpdate, OPStatusChange
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# GridFS para armazenamento de arquivos
fs = AsyncIOMotorGridFSBucket(db)

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Health check endpoint for Kubernetes (direct on app for internal checks)
@app.get("/health")
async def health_check():
    """Health check endpoint for deployment monitoring"""
    return {"status": "healthy", "service": "lumix-backend"}

# Health check also on API router (accessible via /api/health through ingress)
@api_router.get("/health")
async def api_health_check():
    """Health check endpoint accessible via /api prefix"""
    return {"status": "healthy", "service": "lumix-backend"}

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = 'HS256'

# ========== MODELS ==========

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str
    email: str
    name: str
    created_at: str

class TokenResponse(BaseModel):
    token: str
    user: User

class ProductRecipe(BaseModel):
    raw_material_id: str
    quantity_per_liter: float
    unit: str = 'L'  # L (Litros) ou Kg

class Product(BaseModel):
    id: str
    name: str
    unit: str  # Litros ou Kg
    expected_liters: float
    recipes: List[ProductRecipe]
    file_models: Optional[Dict] = None  # Arquivos modelo (OP, Ficha Análise)
    created_at: str
    deleted: bool = False

class ProductCreate(BaseModel):
    name: str
    unit: str
    expected_liters: float
    recipes: List[ProductRecipe]

class RawMaterial(BaseModel):
    id: str
    name: str
    type: str  # Kg ou Litros
    total_stock: float
    supplier_id: str = ''
    received_date: str = ''
    created_at: str
    deleted: bool = False

class RawMaterialCreate(BaseModel):
    name: str
    type: str
    total_stock: float = 0.0
    supplier_id: str = ''
    received_date: str = ''

class ProductBatch(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    product_id: str
    batch_number: str
    date: str
    unit: str
    planned_liters: float
    status: str  # em_producao, em_aberto, finalizado
    total_bottled: float = 0.0
    created_at: str
    deleted: bool = False
    raw_materials_used: Optional[List[Dict]] = None

class ProductBatchCreate(BaseModel):
    product_id: str
    date: str
    unit: str
    planned_liters: float
    custom_batch_number: Optional[str] = None  # Número de lote customizado

class ProductBatchUpdate(BaseModel):
    batch_number: Optional[str] = None
    date: Optional[str] = None
    unit: Optional[str] = None
    planned_liters: Optional[float] = None

class RawMaterialBatch(BaseModel):
    id: str
    raw_material_id: str
    batch_number: str
    date: str
    quantity: float
    status: str
    supplier_batch_number: str = ''  # Lote do fornecedor
    expiry_date: str = ''  # Validade
    created_at: str
    deleted: bool = False

class RawMaterialBatchCreate(BaseModel):
    raw_material_id: str
    date: str
    quantity: float
    supplier_batch_number: str = ''
    expiry_date: str = ''
    custom_batch_number: Optional[str] = None  # Número de lote customizado

class RawMaterialBatchUpdate(BaseModel):
    batch_number: Optional[str] = None
    date: Optional[str] = None
    quantity: Optional[float] = None
    supplier_batch_number: Optional[str] = None
    expiry_date: Optional[str] = None

class MaterialUsed(BaseModel):
    raw_material_id: str
    quantity: float

class ProductionOrder(BaseModel):
    id: str
    product_id: str
    product_batch_id: str
    date: str
    weigher: str
    production_size: float
    materials_used: List[MaterialUsed]
    status: str  # em_producao, finalizado
    created_at: str
    deleted: bool = False

class ProductionOrderCreate(BaseModel):
    product_id: str
    product_batch_id: str
    date: str
    weigher: str
    production_size: float
    materials_used: List[MaterialUsed]

class Counting(BaseModel):
    id: str
    product_batch_id: str
    # Opções de volume (ml/L)
    half_liter: int = 0      # 500ml
    one_liter: int = 0       # 1L
    two_liter: int = 0       # 2L
    five_liter: int = 0      # 5L
    # Opções de peso (g/Kg)
    three_thirty_gram: int = 0  # 330g
    five_hundred_gram: int = 0  # 500g
    one_kg: int = 0             # 1Kg
    total: float = 0.0
    unit: str = 'L'  # Unidade: 'L' ou 'Kg'
    operator: str
    created_at: str

class CountingCreate(BaseModel):
    half_liter: int = 0
    one_liter: int = 0
    two_liter: int = 0
    five_liter: int = 0
    three_thirty_gram: int = 0
    five_hundred_gram: int = 0
    one_kg: int = 0
    operator: str

class TeamMember(BaseModel):
    id: str
    name: str
    role: str
    active: bool = True
    created_at: str
    deleted: bool = False

class TeamMemberCreate(BaseModel):
    name: str
    role: str

class Supplier(BaseModel):
    id: str
    name: str
    contact: str
    phone: str
    email: str
    address: str
    created_at: str
    deleted: bool = False

class SupplierCreate(BaseModel):
    name: str
    contact: str = ''
    phone: str = ''
    email: str = ''
    address: str = ''

# ========== AMOSTRAS MODELS ==========
class Sample(BaseModel):
    id: str
    product_id: str
    product_batch_id: str
    month: int
    year: int
    status: str  # 'pendente' ou 'retirado'
    requested_at: str
    collected_by: Optional[str] = None
    collected_at: Optional[str] = None

# ========== LAUDOS MODELS ==========
class LaudoFolder(BaseModel):
    id: str
    name: str
    parent_id: Optional[str] = None  # Para subpastas
    created_at: str
    created_by: str
    deleted: bool = False

class LaudoFolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None

class LaudoFile(BaseModel):
    id: str
    folder_id: str
    file_id: str  # GridFS file_id
    filename: str
    content_type: str
    size: int
    uploaded_at: str
    uploaded_by: str
    uploaded_by_name: str
    notes: str = ''
    deleted: bool = False

class LaudoFileUpload(BaseModel):
    folder_id: str
    notes: str = ''

class TrashItem(BaseModel):
    id: str
    item_type: str
    item_data: Dict[str, Any]
    deleted_at: str

class DashboardSummary(BaseModel):
    open_batches: int
    in_production_orders: int
    liters_bottled_month: float

class MonthlyArchive(BaseModel):
    year: int
    month: int
    month_name: str

# ========== AUTH UTILS ==========

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        user = await db.users.find_one({'id': user_id}, {'_id': 0})
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except Exception:
        raise HTTPException(status_code=401, detail='Invalid token')

# ========== RAW MATERIAL DEDUCTION LOGIC ==========

async def deduct_from_raw_material_batches(raw_material_id: str, needed_qty: float) -> list:
    """
    Desconta needed_qty dos lotes mais recentes de uma matéria-prima.
    Usa LIFO: lote mais recente primeiro.
    Auto-finaliza lotes que chegam a 0.
    Retorna lista de lotes usados com quantidades consumidas.
    """
    used_batches = []
    remaining = needed_qty

    # Buscar lotes em aberto, mais recente primeiro
    batches = await db.raw_material_batches.find({
        'raw_material_id': raw_material_id,
        'status': 'em_aberto',
        'deleted': {'$ne': True},
        'quantity': {'$gt': 0}
    }).sort('date', -1).to_list(100)

    for batch in batches:
        if remaining <= 0:
            break

        available = batch['quantity']
        to_deduct = min(available, remaining)
        new_qty = round(available - to_deduct, 4)

        update_fields = {'quantity': new_qty}
        if new_qty <= 0:
            update_fields['status'] = 'finalizado'

        await db.raw_material_batches.update_one(
            {'id': batch['id']},
            {'$set': update_fields}
        )

        used_batches.append({
            'batch_id': batch['id'],
            'batch_number': batch.get('batch_number', ''),
            'supplier_batch_number': batch.get('supplier_batch_number', ''),
            'expiry_date': batch.get('expiry_date', ''),
            'quantity_used': to_deduct,
            'remaining_after': new_qty
        })

        remaining = round(remaining - to_deduct, 4)

    # Atualizar estoque total da matéria-prima
    actually_deducted = needed_qty - remaining
    if actually_deducted > 0:
        await db.raw_materials.update_one(
            {'id': raw_material_id},
            {'$inc': {'total_stock': -actually_deducted}}
        )

    return used_batches


async def auto_finalize_zero_batches():
    """
    Finaliza automaticamente todos os lotes de MP com quantidade <= 0 que ainda estão em_aberto.
    """
    result = await db.raw_material_batches.update_many(
        {
            'status': 'em_aberto',
            'deleted': {'$ne': True},
            'quantity': {'$lte': 0}
        },
        {'$set': {'status': 'finalizado'}}
    )
    return result.modified_count


async def restore_raw_materials_for_batch(batch_doc: dict) -> dict:
    """
    Devolve para o estoque a matéria-prima que foi descontada por um lote de produto.
    Lê batch_doc['raw_materials_used'] e:
      - Soma a quantidade de volta nos lotes específicos de MP usados
      - Reabre lotes de MP que estavam finalizados por terem zerado
      - Atualiza total_stock da MP
    Retorna um resumo do que foi devolvido.
    """
    summary = []
    for mat_used in (batch_doc.get('raw_materials_used') or []):
        rm_id = mat_used.get('raw_material_id')
        if not rm_id:
            continue
        total_restored = 0.0
        for b in (mat_used.get('batches_consumed') or []):
            qty = float(b.get('quantity_used') or 0)
            if qty <= 0 or not b.get('batch_id'):
                continue
            await db.raw_material_batches.update_one(
                {'id': b['batch_id']},
                {
                    '$inc': {'quantity': qty},
                    '$set': {'status': 'em_aberto'}  # reabre se tinha finalizado por zerar
                }
            )
            total_restored = round(total_restored + qty, 4)
        if total_restored > 0:
            await db.raw_materials.update_one(
                {'id': rm_id},
                {'$inc': {'total_stock': total_restored}}
            )
            summary.append({
                'raw_material_id': rm_id,
                'raw_material_name': mat_used.get('raw_material_name', ''),
                'restored': total_restored
            })
    return {'restored': summary}


async def compute_and_deduct_for_batch(product: dict, planned_liters: float) -> list:
    """
    Calcula a MP necessária para `planned_liters` litros de `product` e desconta via LIFO.
    Retorna a lista `raw_materials_used` no mesmo formato salvo em product_batches.
    """
    all_materials_used = []
    if not product or not product.get('recipes'):
        return all_materials_used

    expected_liters = product.get('expected_liters', 0) or 0
    for recipe in product['recipes']:
        rm_id = recipe.get('raw_material_id')
        qty_total = recipe.get('quantity_per_liter', 0) or 0
        if not rm_id or qty_total <= 0:
            continue

        if expected_liters > 0:
            needed = qty_total * (planned_liters / expected_liters)
        else:
            needed = qty_total
        needed = round(needed, 4)
        if needed <= 0:
            continue

        used_batches = await deduct_from_raw_material_batches(rm_id, needed)

        rm_doc = await db.raw_materials.find_one({'id': rm_id}, {'_id': 0})
        rm_name = rm_doc['name'] if rm_doc else rm_id

        all_materials_used.append({
            'raw_material_id': rm_id,
            'raw_material_name': rm_name,
            'quantity_needed': needed,
            'unit': recipe.get('unit', 'Kg'),
            'batches_consumed': used_batches
        })

    return all_materials_used

# ========== AUTH ENDPOINTS ==========

@api_router.get('/')
async def root():
    return {'message': 'Lumix API - Gestão Inteligente de Produção'}

@api_router.post('/auth/register', response_model=TokenResponse)
async def register(data: UserRegister):
    existing = await db.users.find_one({'email': data.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    import uuid
    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id,
        'email': data.email,
        'password': hash_password(data.password),
        'name': data.name,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    user = User(
        id=user_id,
        email=data.email,
        name=data.name,
        created_at=user_doc['created_at']
    )
    return TokenResponse(token=token, user=user)

@api_router.post('/auth/login', response_model=TokenResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({'email': data.email}, {'_id': 0})
    if not user or not verify_password(data.password, user['password']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    token = create_token(user['id'])
    user_obj = User(
        id=user['id'],
        email=user['email'],
        name=user['name'],
        created_at=user['created_at']
    )
    return TokenResponse(token=token, user=user_obj)

@api_router.get('/auth/me', response_model=User)
async def get_me(current_user = Depends(get_current_user)):
    return User(**current_user)

# ========== PRODUCTS ==========

@api_router.get('/products', response_model=List[Product])
async def get_products(current_user = Depends(get_current_user)):
    products = await db.products.find({'deleted': False}, {'_id': 0}).to_list(1000)
    return products

@api_router.post('/products', response_model=Product)
async def create_product(data: ProductCreate, current_user = Depends(get_current_user)):
    import uuid
    product_id = str(uuid.uuid4())
    product_doc = {
        'id': product_id,
        'name': data.name,
        'unit': data.unit,
        'expected_liters': data.expected_liters,
        'recipes': [r.model_dump() for r in data.recipes],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False
    }
    await db.products.insert_one(product_doc)
    return Product(**product_doc)

@api_router.put('/products/{product_id}', response_model=Product)
async def update_product(product_id: str, data: ProductCreate, current_user = Depends(get_current_user)):
    result = await db.products.update_one(
        {'id': product_id},
        {'$set': {
            'name': data.name,
            'unit': data.unit,
            'expected_liters': data.expected_liters,
            'recipes': [r.model_dump() for r in data.recipes]
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Product not found')
    product = await db.products.find_one({'id': product_id}, {'_id': 0})
    return Product(**product)

@api_router.delete('/products/{product_id}')
async def delete_product(product_id: str, current_user = Depends(get_current_user)):
    product = await db.products.find_one({'id': product_id}, {'_id': 0})
    if not product:
        raise HTTPException(status_code=404, detail='Product not found')
    
    await db.trash.insert_one({
        'id': str(__import__('uuid').uuid4()),
        'item_type': 'product',
        'item_data': product,
        'deleted_at': datetime.now(timezone.utc).isoformat()
    })
    await db.products.update_one({'id': product_id}, {'$set': {'deleted': True}})
    return {'message': 'Product moved to trash'}

# ========== PRODUCT BATCHES ==========

async def generate_batch_number(date_str: str) -> str:
    """
    Gera número de lote seguindo o ÚLTIMO lote criado.
    
    Lógica:
    - Busca o lote mais recente (por data de criação)
    - Incrementa +1 a partir dele
    - Se não houver lotes, usa formato AAMMCCC (ano, mês, contador)
    """
    date_obj = datetime.fromisoformat(date_str)
    yymm = date_obj.strftime('%y%m')  # AAMM
    
    # Buscar o ÚLTIMO lote criado (mais recente) de produtos
    last_product_batch = await db.product_batches.find_one(
        {'deleted': False},
        {'_id': 0, 'batch_number': 1, 'created_at': 1},
        sort=[('created_at', -1)]
    )
    
    # Buscar o ÚLTIMO lote criado (mais recente) de matérias-primas
    last_rm_batch = await db.raw_material_batches.find_one(
        {'deleted': False},
        {'_id': 0, 'batch_number': 1, 'created_at': 1},
        sort=[('created_at', -1)]
    )
    
    # Determinar qual é o mais recente entre os dois
    last_batch = None
    
    if last_product_batch and last_rm_batch:
        # Comparar as datas de criação
        if last_product_batch['created_at'] > last_rm_batch['created_at']:
            last_batch = last_product_batch
        else:
            last_batch = last_rm_batch
    elif last_product_batch:
        last_batch = last_product_batch
    elif last_rm_batch:
        last_batch = last_rm_batch
    
    # Se não houver nenhum lote, começar do 001
    if not last_batch:
        return f"{yymm}001"
    
    # Pegar o número do último lote e incrementar
    last_batch_number = last_batch['batch_number']
    
    # Validar se é numérico
    if last_batch_number.isdigit():
        next_number = int(last_batch_number) + 1
        return str(next_number)
    else:
        # Se não for numérico, usar padrão
        return f"{yymm}001"

@api_router.get('/batches/next-number')
async def get_next_batch_number(date: str, current_user = Depends(get_current_user)):
    """
    Retorna o próximo número de lote para uma data específica.
    Útil para mostrar no frontend antes de criar o lote.
    """
    next_number = await generate_batch_number(date)
    return {'batch_number': next_number, 'date': date}

@api_router.get('/product-batches', response_model=List[ProductBatch])
async def get_product_batches(current_user = Depends(get_current_user)):
    batches = await db.product_batches.find({'deleted': False}, {'_id': 0}).to_list(1000)
    return batches

@api_router.post('/product-batches', response_model=ProductBatch)
async def create_product_batch(data: ProductBatchCreate, current_user = Depends(get_current_user)):
    import uuid
    batch_id = str(uuid.uuid4())
    
    # Se o usuário forneceu um número customizado, usar ele
    if data.custom_batch_number:
        batch_number = data.custom_batch_number.strip()
        
        # Validar formato numérico
        if not batch_number.isdigit():
            raise HTTPException(status_code=400, detail='Número de lote deve conter apenas dígitos')
        
        # Verificar se já existe
        existing = await db.product_batches.find_one({
            'batch_number': batch_number,
            'deleted': False
        })
        existing_rm = await db.raw_material_batches.find_one({
            'batch_number': batch_number,
            'deleted': False
        })
        if existing or existing_rm:
            raise HTTPException(status_code=400, detail=f'Número de lote {batch_number} já existe')
    else:
        # Gerar automaticamente (já considera números customizados anteriores)
        batch_number = await generate_batch_number(data.date)
    
    batch_doc = {
        'id': batch_id,
        'product_id': data.product_id,
        'batch_number': batch_number,
        'date': data.date,
        'unit': data.unit,
        'planned_liters': data.planned_liters,
        'status': 'em_producao',  # Começa em produção, precisa ser liberado para envase
        'total_bottled': 0.0,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False,
        'is_custom': bool(data.custom_batch_number),
        'raw_materials_used': []  # Rastreabilidade de MP usadas
    }
    
    # === DESCONTO DE MATÉRIAS-PRIMAS ===
    product = await db.products.find_one({'id': data.product_id, 'deleted': False}, {'_id': 0})
    if product and product.get('recipes'):
        batch_doc['raw_materials_used'] = await compute_and_deduct_for_batch(product, data.planned_liters)
    
    await db.product_batches.insert_one(batch_doc)
    
    # Auto-finalizar lotes de MP que chegaram a 0
    await auto_finalize_zero_batches()
    
    # Remover _id para retorno (insert_one adiciona _id ao dict)
    batch_doc.pop('_id', None)
    
    # Verificar se precisa criar amostra (primeiro lote do produto no mês)
    batch_date = datetime.fromisoformat(data.date)
    existing_sample = await db.samples.find_one({
        'product_id': data.product_id,
        'month': batch_date.month,
        'year': batch_date.year,
        'deleted': {'$ne': True}
    })
    
    if not existing_sample:
        sample_doc = {
            'id': str(uuid.uuid4()),
            'product_id': data.product_id,
            'product_batch_id': batch_id,
            'month': batch_date.month,
            'year': batch_date.year,
            'status': 'pendente',
            'requested_at': datetime.now(timezone.utc).isoformat(),
            'collected_by': None,
            'collected_at': None
        }
        await db.samples.insert_one(sample_doc)
    
    # === FICHA DE ANÁLISE / ORDEM DE PRODUÇÃO ===
    # Cria uma ficha para CADA lote (não mais "uma por mês"). Cada lote vira uma
    # entrada na aba "Ordem de Produção" e fica visível até ser fechada.
    if product:
        # Numeração OP do dia (sequencial por dia, todos os produtos)
        op_count_today = await db.fichas_analise.count_documents({
            'date': data.date,
            'deleted': {'$ne': True}
        })
        op_number = op_count_today + 1

        ficha_doc = {
            'id': str(uuid.uuid4()),
            'product_id': data.product_id,
            'product_name': product.get('name', ''),
            'product_batch_id': batch_id,
            'batch_number': batch_number,
            'month': batch_date.month,
            'year': batch_date.year,
            'date': data.date,
            'op_number': op_number,
            'planned_liters': data.planned_liters,
            'unit': data.unit,
            'expected_liters': product.get('expected_liters', 0),
            'recipes': [],
            'status': 'aberta',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'deleted': False
        }

        # Preencher receita com dados detalhados de MP
        for mat_used in batch_doc.get('raw_materials_used', []):
            recipe_entry = {
                'raw_material_id': mat_used['raw_material_id'],
                'raw_material_name': mat_used['raw_material_name'],
                'quantity_needed': mat_used['quantity_needed'],
                'unit': mat_used.get('unit', ''),
                'batches_consumed': mat_used.get('batches_consumed', [])
            }
            ficha_doc['recipes'].append(recipe_entry)

        await db.fichas_analise.insert_one(ficha_doc)

    return ProductBatch(**batch_doc)

@api_router.put('/product-batches/{batch_id}', response_model=ProductBatch)
async def update_product_batch(batch_id: str, data: ProductBatchUpdate, current_user = Depends(get_current_user)):
    batch = await db.product_batches.find_one({'id': batch_id}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Batch not found')
    
    # Preparar campos para atualização
    update_fields = {}
    
    if data.batch_number is not None:
        # Verificar se o novo número já existe (exceto no lote atual)
        existing = await db.product_batches.find_one({
            'batch_number': data.batch_number,
            'id': {'$ne': batch_id},
            'deleted': False
        })
        existing_rm = await db.raw_material_batches.find_one({
            'batch_number': data.batch_number,
            'deleted': False
        })
        if existing or existing_rm:
            raise HTTPException(status_code=400, detail='Batch number already exists')
        update_fields['batch_number'] = data.batch_number
    
    if data.date is not None:
        update_fields['date'] = data.date
    if data.unit is not None:
        update_fields['unit'] = data.unit
    if data.planned_liters is not None:
        update_fields['planned_liters'] = data.planned_liters

    # === RECÁLCULO DE MP NA EDIÇÃO DE planned_liters ===
    # Se a litragem planejada mudou, devolvemos a MP antes e descontamos baseado na nova.
    new_materials_used = None
    if data.planned_liters is not None and float(data.planned_liters) != float(batch.get('planned_liters') or 0):
        # 1) Devolve a MP que foi descontada (usando o que estava em raw_materials_used)
        await restore_raw_materials_for_batch(batch)
        # 2) Desconta de novo com base na nova litragem planejada
        product = await db.products.find_one({'id': batch.get('product_id'), 'deleted': False}, {'_id': 0})
        new_materials_used = await compute_and_deduct_for_batch(product or {}, float(data.planned_liters))
        update_fields['raw_materials_used'] = new_materials_used
        await auto_finalize_zero_batches()

    if update_fields:
        await db.product_batches.update_one(
            {'id': batch_id},
            {'$set': update_fields}
        )
    
    updated = await db.product_batches.find_one({'id': batch_id}, {'_id': 0})
    return ProductBatch(**updated)

@api_router.get('/product-batches/check-open/{product_id}')
async def check_open_batch(product_id: str, current_user = Depends(get_current_user)):
    """
    Verifica se existe um lote em aberto para o produto especificado.
    Retorna o lote existente ou null.
    """
    existing_batch = await db.product_batches.find_one({
        'product_id': product_id,
        'status': {'$ne': 'finalizado'},
        'deleted': False
    }, {'_id': 0})
    
    if existing_batch:
        return {
            'has_open_batch': True,
            'batch': existing_batch
        }
    
    return {
        'has_open_batch': False,
        'batch': None
    }

@api_router.delete('/product-batches/{batch_id}')
async def delete_product_batch(batch_id: str, current_user = Depends(get_current_user)):
    batch = await db.product_batches.find_one({'id': batch_id}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Batch not found')

    # Devolve MP que estava reservada para este lote (em qualquer status, pois o lote
    # vai para a lixeira — se for restaurado, o cálculo terá que ser refeito).
    mp_summary = await restore_raw_materials_for_batch(batch)

    await db.trash.insert_one({
        'id': str(__import__('uuid').uuid4()),
        'item_type': 'product_batch',
        'item_data': batch,
        'deleted_at': datetime.now(timezone.utc).isoformat()
    })
    await db.product_batches.update_one({'id': batch_id}, {'$set': {'deleted': True}})
    return {
        'message': 'Batch moved to trash',
        'raw_materials_restored': mp_summary.get('restored', [])
    }

@api_router.post('/product-batches/{batch_id}/finalize')
async def finalize_product_batch(batch_id: str, current_user = Depends(get_current_user)):
    """
    Finaliza um lote de produto mesmo que não tenha atingido a meta de litragem.
    Útil para encerrar lotes parcialmente completados.
    """
    batch = await db.product_batches.find_one({'id': batch_id, 'deleted': False}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Lote não encontrado')
    
    if batch.get('status') == 'finalizado':
        raise HTTPException(status_code=400, detail='Lote já está finalizado')
    
    await db.product_batches.update_one(
        {'id': batch_id},
        {'$set': {'status': 'finalizado'}}
    )
    
    return {
        'message': 'Lote finalizado com sucesso',
        'batch_number': batch.get('batch_number'),
        'total_bottled': batch.get('total_bottled', 0),
        'planned_liters': batch.get('planned_liters', 0)
    }

@api_router.post('/product-batches/{batch_id}/reopen')
async def reopen_product_batch(batch_id: str, current_user = Depends(get_current_user)):
    """
    Reabre um lote finalizado (não arquivado), mudando o status de volta para 'em_aberto'.
    """
    batch = await db.product_batches.find_one({'id': batch_id, 'deleted': False}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Lote não encontrado')
    
    if batch.get('status') != 'finalizado':
        raise HTTPException(status_code=400, detail='Apenas lotes finalizados podem ser reabertos')
    
    await db.product_batches.update_one(
        {'id': batch_id},
        {'$set': {'status': 'em_aberto'}}
    )
    
    return {
        'message': 'Lote reaberto com sucesso',
        'batch_number': batch.get('batch_number')
    }

@api_router.post('/product-batches/{batch_id}/ready-for-bottling')
async def mark_ready_for_bottling(batch_id: str, current_user = Depends(get_current_user)):
    """
    Marca um lote como pronto para envase.
    Apenas usuários autorizados (laboratoriolumix@outlook.com e luan_ssss@hotmail.com) podem executar.
    """
    # Verificar permissão
    allowed_emails = ['laboratoriolumix@outlook.com', 'luan_ssss@hotmail.com']
    if current_user.get('email') not in allowed_emails:
        raise HTTPException(status_code=403, detail='Você não tem permissão para liberar lotes para envase')
    
    batch = await db.product_batches.find_one({'id': batch_id, 'deleted': False}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Lote não encontrado')
    
    if batch.get('status') != 'em_producao':
        raise HTTPException(status_code=400, detail='Apenas lotes em produção podem ser liberados para envase')
    
    await db.product_batches.update_one(
        {'id': batch_id},
        {'$set': {
            'status': 'em_aberto',
            'released_for_bottling_at': datetime.now(timezone.utc).isoformat(),
            'released_by': current_user.get('email')
        }}
    )
    
    return {
        'message': 'Lote liberado para envase com sucesso',
        'batch_number': batch.get('batch_number')
    }

@api_router.get('/product-batches/in-production')
async def get_batches_in_production(current_user = Depends(get_current_user)):
    """
    Retorna todos os lotes que estão em produção (aguardando liberação para envase).
    """
    batches = await db.product_batches.find({
        'status': 'em_producao',
        'deleted': False
    }, {'_id': 0}).to_list(1000)
    return batches

@api_router.post('/archive/reopen/{batch_id}')
async def reopen_archived_batch(batch_id: str, current_user = Depends(get_current_user)):
    """
    Reabre um lote arquivado, movendo-o de volta para a coleção de lotes ativos.
    Remove da coleção archived_product_batches e insere em product_batches com status 'em_aberto'.
    """
    # Buscar o lote arquivado
    archived_batch = await db.archived_product_batches.find_one({'id': batch_id}, {'_id': 0})
    if not archived_batch:
        raise HTTPException(status_code=404, detail='Lote arquivado não encontrado')
    
    # Preparar o lote para reinserção (remover campos de arquivamento)
    batch_to_restore = {
        'id': archived_batch['id'],
        'product_id': archived_batch['product_id'],
        'batch_number': archived_batch['batch_number'],
        'date': archived_batch['date'],
        'unit': archived_batch.get('unit', 'Litros'),
        'planned_liters': archived_batch['planned_liters'],
        'status': 'em_aberto',  # Reabrir como em_aberto
        'total_bottled': archived_batch.get('total_bottled', 0),
        'created_at': archived_batch.get('created_at', datetime.now(timezone.utc).isoformat()),
        'deleted': False,
        'reopened_at': datetime.now(timezone.utc).isoformat(),
        'reopened_from_archive': True
    }
    
    # Inserir de volta na coleção de lotes ativos
    await db.product_batches.insert_one(batch_to_restore)
    
    # Restaurar as contagens do histórico
    countings_history = archived_batch.get('countings_history', [])
    if countings_history:
        for counting in countings_history:
            counting['batch_id'] = batch_id
            await db.counting.insert_one(counting)
    
    # Remover da coleção de arquivados
    await db.archived_product_batches.delete_one({'id': batch_id})
    
    return {
        'message': 'Lote reaberto com sucesso',
        'batch_number': archived_batch.get('batch_number'),
        'countings_restored': len(countings_history)
    }

# ========== RAW MATERIALS ==========

@api_router.get('/raw-materials', response_model=List[RawMaterial])
async def get_raw_materials(current_user = Depends(get_current_user)):
    materials = await db.raw_materials.find({'deleted': False}, {'_id': 0}).to_list(1000)
    return materials

@api_router.post('/raw-materials', response_model=RawMaterial)
async def create_raw_material(data: RawMaterialCreate, current_user = Depends(get_current_user)):
    import uuid
    material_id = str(uuid.uuid4())
    material_doc = {
        'id': material_id,
        'name': data.name,
        'type': data.type,
        'total_stock': data.total_stock,
        'supplier_id': data.supplier_id,
        'received_date': data.received_date,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False
    }
    await db.raw_materials.insert_one(material_doc)
    return RawMaterial(**material_doc)

@api_router.put('/raw-materials/{material_id}', response_model=RawMaterial)
async def update_raw_material(material_id: str, data: RawMaterialCreate, current_user = Depends(get_current_user)):
    result = await db.raw_materials.update_one(
        {'id': material_id},
        {'$set': {
            'name': data.name,
            'type': data.type,
            'total_stock': data.total_stock,
            'supplier_id': data.supplier_id,
            'received_date': data.received_date
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Material not found')
    material = await db.raw_materials.find_one({'id': material_id}, {'_id': 0})
    return RawMaterial(**material)

@api_router.delete('/raw-materials/{material_id}')
async def delete_raw_material(material_id: str, current_user = Depends(get_current_user)):
    material = await db.raw_materials.find_one({'id': material_id}, {'_id': 0})
    if not material:
        raise HTTPException(status_code=404, detail='Material not found')
    
    await db.trash.insert_one({
        'id': str(__import__('uuid').uuid4()),
        'item_type': 'raw_material',
        'item_data': material,
        'deleted_at': datetime.now(timezone.utc).isoformat()
    })
    await db.raw_materials.update_one({'id': material_id}, {'$set': {'deleted': True}})
    return {'message': 'Material moved to trash'}

# ========== RAW MATERIAL BATCHES ==========

@api_router.get('/raw-material-batches', response_model=List[RawMaterialBatch])
async def get_raw_material_batches(current_user = Depends(get_current_user)):
    batches = await db.raw_material_batches.find({'deleted': False}, {'_id': 0}).to_list(1000)
    return batches

@api_router.post('/raw-material-batches', response_model=RawMaterialBatch)
async def create_raw_material_batch(data: RawMaterialBatchCreate, current_user = Depends(get_current_user)):
    import uuid
    batch_id = str(uuid.uuid4())
    
    # Se o usuário forneceu um número customizado, usar ele
    if data.custom_batch_number:
        batch_number = data.custom_batch_number.strip()
        
        # Validar formato numérico
        if not batch_number.isdigit():
            raise HTTPException(status_code=400, detail='Número de lote deve conter apenas dígitos')
        
        # Verificar se já existe
        existing = await db.raw_material_batches.find_one({
            'batch_number': batch_number,
            'deleted': False
        })
        existing_prod = await db.product_batches.find_one({
            'batch_number': batch_number,
            'deleted': False
        })
        if existing or existing_prod:
            raise HTTPException(status_code=400, detail=f'Número de lote {batch_number} já existe')
    else:
        # Gerar automaticamente (já considera números customizados anteriores)
        batch_number = await generate_batch_number(data.date)
    
    batch_doc = {
        'id': batch_id,
        'raw_material_id': data.raw_material_id,
        'batch_number': batch_number,
        'date': data.date,
        'quantity': data.quantity,
        'supplier_batch_number': data.supplier_batch_number,
        'expiry_date': data.expiry_date,
        'status': 'em_aberto',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False,
        'is_custom': bool(data.custom_batch_number)
    }
    await db.raw_material_batches.insert_one(batch_doc)
    
    # Update stock
    await db.raw_materials.update_one(
        {'id': data.raw_material_id},
        {'$inc': {'total_stock': data.quantity}}
    )
    
    return RawMaterialBatch(**batch_doc)

@api_router.put('/raw-material-batches/{batch_id}', response_model=RawMaterialBatch)
async def update_raw_material_batch(batch_id: str, data: RawMaterialBatchUpdate, current_user = Depends(get_current_user)):
    batch = await db.raw_material_batches.find_one({'id': batch_id}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Batch not found')
    
    # Preparar campos para atualização
    update_fields = {}
    
    if data.batch_number is not None:
        # Verificar se o novo número já existe (exceto no lote atual)
        existing = await db.raw_material_batches.find_one({
            'batch_number': data.batch_number,
            'id': {'$ne': batch_id},
            'deleted': False
        })
        existing_prod = await db.product_batches.find_one({
            'batch_number': data.batch_number,
            'deleted': False
        })
        if existing or existing_prod:
            raise HTTPException(status_code=400, detail='Batch number already exists')
        update_fields['batch_number'] = data.batch_number
    
    if data.date is not None:
        update_fields['date'] = data.date
    
    if data.supplier_batch_number is not None:
        update_fields['supplier_batch_number'] = data.supplier_batch_number
    
    if data.expiry_date is not None:
        update_fields['expiry_date'] = data.expiry_date
    
    # Se a quantidade mudou, ajustar o estoque
    if data.quantity is not None and data.quantity != batch.get('quantity', 0):
        old_quantity = batch.get('quantity', 0)
        quantity_diff = data.quantity - old_quantity
        await db.raw_materials.update_one(
            {'id': batch['raw_material_id']},
            {'$inc': {'total_stock': quantity_diff}}
        )
        update_fields['quantity'] = data.quantity
    
    if update_fields:
        await db.raw_material_batches.update_one(
            {'id': batch_id},
            {'$set': update_fields}
        )
    
    updated = await db.raw_material_batches.find_one({'id': batch_id}, {'_id': 0})
    return RawMaterialBatch(**updated)

@api_router.delete('/raw-material-batches/{batch_id}')
async def delete_raw_material_batch(batch_id: str, current_user = Depends(get_current_user)):
    batch = await db.raw_material_batches.find_one({'id': batch_id}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Batch not found')
    
    await db.trash.insert_one({
        'id': str(__import__('uuid').uuid4()),
        'item_type': 'raw_material_batch',
        'item_data': batch,
        'deleted_at': datetime.now(timezone.utc).isoformat()
    })
    await db.raw_material_batches.update_one({'id': batch_id}, {'$set': {'deleted': True}})
    return {'message': 'Batch moved to trash'}

@api_router.post('/raw-material-batches/{batch_id}/finalize')
async def finalize_raw_material_batch(batch_id: str, current_user = Depends(get_current_user)):
    """Finaliza um lote de matéria-prima manualmente"""
    batch = await db.raw_material_batches.find_one({'id': batch_id, 'deleted': False}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Lote não encontrado')
    
    if batch.get('status') == 'finalizado':
        raise HTTPException(status_code=400, detail='Lote já está finalizado')
    
    await db.raw_material_batches.update_one(
        {'id': batch_id},
        {'$set': {'status': 'finalizado'}}
    )
    
    return {'message': 'Lote finalizado com sucesso'}


@api_router.post('/raw-materials/recalculate-stock')
async def recalculate_raw_material_stock(current_user = Depends(get_current_user)):
    """
    Recalcula o estoque total de todas as matérias-primas baseado nos lotes em aberto.
    Auto-finaliza lotes com quantidade <= 0.
    Corrige inconsistências no estoque.
    """
    # 1. Auto-finalizar lotes zerados
    finalized_count = await auto_finalize_zero_batches()
    
    # 2. Recalcular total_stock para cada matéria-prima
    materials = await db.raw_materials.find({'deleted': False}, {'_id': 0}).to_list(1000)
    corrections = []
    
    for mat in materials:
        # Somar quantidade de todos os lotes em_aberto
        pipeline = [
            {
                '$match': {
                    'raw_material_id': mat['id'],
                    'status': 'em_aberto',
                    'deleted': False
                }
            },
            {
                '$group': {
                    '_id': None,
                    'total': {'$sum': '$quantity'}
                }
            }
        ]
        result = await db.raw_material_batches.aggregate(pipeline).to_list(1)
        real_stock = result[0]['total'] if result else 0
        old_stock = mat.get('total_stock', 0)
        
        if round(real_stock, 2) != round(old_stock, 2):
            await db.raw_materials.update_one(
                {'id': mat['id']},
                {'$set': {'total_stock': round(real_stock, 4)}}
            )
            corrections.append({
                'name': mat['name'],
                'old_stock': old_stock,
                'new_stock': round(real_stock, 4)
            })
    
    return {
        'message': 'Estoque recalculado com sucesso',
        'batches_finalized': finalized_count,
        'corrections': corrections,
        'total_materials_checked': len(materials)
    }


@api_router.get('/raw-materials/audit')
async def audit_recipes(current_user = Depends(get_current_user)):
    """
    Lista produtos com problemas que impedem o desconto correto de matéria-prima:
      - Produto sem receita cadastrada
      - Produto com expected_liters = 0 (litragem esperada)
      - Receita sem matéria-prima vinculada
      - Item da receita com quantidade <= 0
      - Receita apontando para MP inexistente/deletada
    """
    products = await db.products.find({'deleted': False}, {'_id': 0}).to_list(2000)
    all_rms = await db.raw_materials.find({}, {'_id': 0, 'id': 1, 'name': 1, 'deleted': 1}).to_list(5000)
    rm_map = {rm['id']: rm for rm in all_rms}

    issues = []
    for p in products:
        recipes = p.get('recipes') or []
        expected = p.get('expected_liters') or 0
        problems = []

        if not recipes:
            problems.append('Sem receita cadastrada (nenhuma MP será descontada)')

        if expected <= 0:
            problems.append('Litragem esperada (expected_liters) é 0 — cálculo proporcional fica incorreto')

        for idx, r in enumerate(recipes):
            rid = r.get('raw_material_id')
            qty = r.get('quantity_per_liter', 0) or 0
            if not rid:
                problems.append(f'Receita #{idx + 1} sem matéria-prima vinculada')
                continue
            rm = rm_map.get(rid)
            if not rm or rm.get('deleted'):
                problems.append(f'Receita #{idx + 1} aponta para MP inexistente/deletada')
            if qty <= 0:
                problems.append(f'Receita #{idx + 1} com quantidade zerada')

        if problems:
            issues.append({
                'product_id': p['id'],
                'product_name': p.get('name', ''),
                'expected_liters': expected,
                'recipes_count': len(recipes),
                'issues': problems
            })

    issues.sort(key=lambda x: x['product_name'].lower())
    return {
        'total_products_checked': len(products),
        'total_with_issues': len(issues),
        'products': issues
    }


# ========== FICHAS DE ANÁLISE ==========

@api_router.get('/fichas-analise')
async def get_fichas_analise(status: str = 'aberta', current_user = Depends(get_current_user)):
    """Retorna fichas de análise. Apenas para laboratoriolumix@outlook.com"""
    if current_user.get('email') != 'laboratoriolumix@outlook.com':
        raise HTTPException(status_code=403, detail='Acesso restrito ao laboratório')
    
    query = {'deleted': {'$ne': True}}
    if status:
        query['status'] = status
    
    fichas = await db.fichas_analise.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return fichas


@api_router.put('/fichas-analise/{ficha_id}/close')
async def close_ficha_analise(ficha_id: str, current_user = Depends(get_current_user)):
    """Fecha uma ficha de análise"""
    if current_user.get('email') != 'laboratoriolumix@outlook.com':
        raise HTTPException(status_code=403, detail='Acesso restrito ao laboratório')
    
    result = await db.fichas_analise.update_one(
        {'id': ficha_id},
        {'$set': {'status': 'fechada', 'closed_at': datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Ficha não encontrada')
    
    return {'message': 'Ficha fechada com sucesso'}


@api_router.post('/fichas-analise/backfill')
async def backfill_fichas_analise(current_user = Depends(get_current_user)):
    """
    Cria fichas/OPs para lotes de produto existentes que ainda não têm uma ficha.
    Útil para popular a aba Ordem de Produção com lotes históricos em aberto.
    Só inclui lotes não-finalizados e não-deletados.
    """
    if current_user.get('email') != 'laboratoriolumix@outlook.com':
        raise HTTPException(status_code=403, detail='Acesso restrito ao laboratório')

    # Pega todos os lotes em aberto que ainda não têm ficha vinculada
    batches = await db.product_batches.find(
        {'deleted': {'$ne': True}, 'status': {'$ne': 'finalizado'}},
        {'_id': 0}
    ).to_list(5000)

    existing_batch_ids = set()
    async for f in db.fichas_analise.find(
        {'deleted': {'$ne': True}},
        {'_id': 0, 'product_batch_id': 1}
    ):
        if f.get('product_batch_id'):
            existing_batch_ids.add(f['product_batch_id'])

    created = 0
    for b in batches:
        if b['id'] in existing_batch_ids:
            continue
        product = await db.products.find_one({'id': b.get('product_id')}, {'_id': 0})
        if not product:
            continue
        try:
            batch_date = datetime.fromisoformat(str(b.get('date')).split('T')[0])
        except Exception:
            batch_date = datetime.now(timezone.utc)

        op_count = await db.fichas_analise.count_documents({
            'date': b.get('date'),
            'deleted': {'$ne': True}
        })
        ficha_doc = {
            'id': str(uuid.uuid4()),
            'product_id': b.get('product_id'),
            'product_name': product.get('name', ''),
            'product_batch_id': b['id'],
            'batch_number': b.get('batch_number', ''),
            'month': batch_date.month,
            'year': batch_date.year,
            'date': b.get('date'),
            'op_number': op_count + 1,
            'planned_liters': b.get('planned_liters', 0),
            'unit': b.get('unit', 'Litros'),
            'expected_liters': product.get('expected_liters', 0),
            'recipes': [
                {
                    'raw_material_id': m.get('raw_material_id'),
                    'raw_material_name': m.get('raw_material_name'),
                    'quantity_needed': m.get('quantity_needed'),
                    'unit': m.get('unit', ''),
                    'batches_consumed': m.get('batches_consumed', []),
                }
                for m in (b.get('raw_materials_used') or [])
            ],
            'status': 'aberta',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'deleted': False,
            'backfilled': True,
        }
        await db.fichas_analise.insert_one(ficha_doc)
        created += 1

    return {'message': f'{created} ordem(ns) de produção criada(s) para lotes existentes', 'created': created}


# ========== FICHA DE ANÁLISE - SISTEMA DE ANÁLISES ==========

# --- Categorias ---
@api_router.get('/analise-categories')
async def get_analise_categories(type: str = None, current_user = Depends(get_current_user)):
    query = {'deleted': {'$ne': True}}
    if type:
        query['type'] = type
    categories = await db.analise_categories.find(query, {'_id': 0}).sort('name', 1).to_list(1000)
    return categories

@api_router.post('/analise-categories')
async def create_analise_category(data: dict = Body(...), current_user = Depends(get_current_user)):
    cat_doc = {
        'id': str(uuid.uuid4()),
        'name': data['name'],
        'type': data['type'],  # 'produto' ou 'materia_prima'
        'items': [],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False
    }
    await db.analise_categories.insert_one(cat_doc)
    cat_doc.pop('_id', None)
    return cat_doc

@api_router.put('/analise-categories/{cat_id}')
async def update_analise_category(cat_id: str, data: dict = Body(...), current_user = Depends(get_current_user)):
    update = {}
    if 'name' in data:
        update['name'] = data['name']
    if 'items' in data:
        update['items'] = data['items']
    await db.analise_categories.update_one({'id': cat_id}, {'$set': update})
    return {'message': 'Categoria atualizada'}

@api_router.delete('/analise-categories/{cat_id}')
async def delete_analise_category(cat_id: str, current_user = Depends(get_current_user)):
    await db.analise_categories.update_one({'id': cat_id}, {'$set': {'deleted': True}})
    return {'message': 'Categoria removida'}

@api_router.post('/analise-categories/{cat_id}/add-item')
async def add_item_to_category(cat_id: str, data: dict = Body(...), current_user = Depends(get_current_user)):
    item_id = data['item_id']
    await db.analise_categories.update_one({'id': cat_id}, {'$addToSet': {'items': item_id}})
    return {'message': 'Item adicionado'}

@api_router.post('/analise-categories/{cat_id}/remove-item')
async def remove_item_from_category(cat_id: str, data: dict = Body(...), current_user = Depends(get_current_user)):
    item_id = data['item_id']
    await db.analise_categories.update_one({'id': cat_id}, {'$pull': {'items': item_id}})
    return {'message': 'Item removido'}

# --- Campos personalizados por produto/MP ---
@api_router.get('/analise-fields/{item_id}')
async def get_analise_fields(item_id: str, current_user = Depends(get_current_user)):
    doc = await db.analise_fields.find_one({'item_id': item_id}, {'_id': 0})
    if not doc:
        # Retornar campos padrão
        return {
            'item_id': item_id,
            'fields': [
                {'name': 'Aspecto', 'order': 0},
                {'name': 'Cor', 'order': 1},
                {'name': 'Odor', 'order': 2},
                {'name': 'pH', 'order': 3},
                {'name': 'Viscosidade', 'order': 4},
                {'name': 'Massa Específica', 'order': 5}
            ]
        }
    return doc

@api_router.put('/analise-fields/{item_id}')
async def save_analise_fields(item_id: str, data: dict = Body(...), current_user = Depends(get_current_user)):
    fields = data.get('fields', [])
    await db.analise_fields.update_one(
        {'item_id': item_id},
        {'$set': {'item_id': item_id, 'fields': fields}},
        upsert=True
    )
    return {'message': 'Campos salvos'}

# --- Análises (registros) ---
@api_router.get('/analises')
async def get_analises(item_id: str = None, item_type: str = None, current_user = Depends(get_current_user)):
    query = {'deleted': {'$ne': True}}
    if item_id:
        query['item_id'] = item_id
    if item_type:
        query['item_type'] = item_type
    analises = await db.analises.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return analises

@api_router.post('/analises')
async def create_analise(data: dict = Body(...), current_user = Depends(get_current_user)):
    analise_doc = {
        'id': str(uuid.uuid4()),
        'item_id': data['item_id'],
        'item_type': data['item_type'],  # 'produto' ou 'materia_prima'
        'item_name': data.get('item_name', ''),
        'batch_id': data['batch_id'],
        'batch_number': data.get('batch_number', ''),
        'date': data.get('date', ''),
        'results': data.get('results', {}),
        'specifications': data.get('specifications', {}),
        'status': data.get('status', 'aprovado'),
        'raw_materials_used': data.get('raw_materials_used', []),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': current_user.get('name', current_user.get('email', '')),
        'deleted': False
    }
    await db.analises.insert_one(analise_doc)
    analise_doc.pop('_id', None)
    return analise_doc

@api_router.delete('/analises/{analise_id}')
async def delete_analise(analise_id: str, current_user = Depends(get_current_user)):
    await db.analises.update_one({'id': analise_id}, {'$set': {'deleted': True}})
    return {'message': 'Análise removida'}

# --- Lotes por item (para seletor) ---
@api_router.get('/analise-batches/{item_type}/{item_id}')
async def get_batches_for_analise(item_type: str, item_id: str, current_user = Depends(get_current_user)):
    if item_type == 'produto':
        batches = await db.product_batches.find(
            {'product_id': item_id, 'deleted': {'$ne': True}},
            {'_id': 0}
        ).sort('created_at', -1).to_list(100)
        # Also check archived
        archived = await db.archived_product_batches.find(
            {'product_id': item_id},
            {'_id': 0}
        ).sort('created_at', -1).to_list(100)
        return batches + archived
    else:
        batches = await db.raw_material_batches.find(
            {'raw_material_id': item_id, 'deleted': {'$ne': True}},
            {'_id': 0}
        ).sort('date', -1).to_list(100)
        return batches


# ========== PRODUCTION ORDERS ==========

@api_router.get('/production-orders', response_model=List[ProductionOrder])
async def get_production_orders(current_user = Depends(get_current_user)):
    orders = await db.production_orders.find({'deleted': False}, {'_id': 0}).to_list(1000)
    return orders

@api_router.post('/production-orders', response_model=ProductionOrder)
async def create_production_order(data: ProductionOrderCreate, current_user = Depends(get_current_user)):
    import uuid
    order_id = str(uuid.uuid4())
    
    # Deduct stock for each material
    for material in data.materials_used:
        result = await db.raw_materials.update_one(
            {'id': material.raw_material_id},
            {'$inc': {'total_stock': -material.quantity}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail=f'Material {material.raw_material_id} not found')
    
    order_doc = {
        'id': order_id,
        'product_id': data.product_id,
        'product_batch_id': data.product_batch_id,
        'date': data.date,
        'weigher': data.weigher,
        'production_size': data.production_size,
        'materials_used': [m.model_dump() for m in data.materials_used],
        'status': 'em_producao',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False
    }
    await db.production_orders.insert_one(order_doc)
    return ProductionOrder(**order_doc)

@api_router.delete('/production-orders/{order_id}')
async def delete_production_order(order_id: str, current_user = Depends(get_current_user)):
    order = await db.production_orders.find_one({'id': order_id}, {'_id': 0})
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    
    await db.trash.insert_one({
        'id': str(__import__('uuid').uuid4()),
        'item_type': 'production_order',
        'item_data': order,
        'deleted_at': datetime.now(timezone.utc).isoformat()
    })
    await db.production_orders.update_one({'id': order_id}, {'$set': {'deleted': True}})
    return {'message': 'Order moved to trash'}

# ========== COUNTING ==========

@api_router.get('/counting/{batch_id}', response_model=List[Counting])
async def get_counting(batch_id: str, current_user = Depends(get_current_user)):
    counts = await db.counting.find({'product_batch_id': batch_id}, {'_id': 0}).to_list(1000)
    return counts

@api_router.post('/counting/{batch_id}', response_model=Counting)
async def add_counting(batch_id: str, data: CountingCreate, current_user = Depends(get_current_user)):
    import uuid
    
    # Buscar o lote e o produto para saber a unidade
    batch = await db.product_batches.find_one({'id': batch_id}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Lote não encontrado')
    
    product = await db.products.find_one({'id': batch.get('product_id')}, {'_id': 0})
    unit = (product.get('unit', 'L') if product else 'L').lower()
    is_weight = 'kg' in unit or 'g' in unit or 'quilo' in unit
    
    # Calculate total baseado na unidade do produto
    if is_weight:
        # Produto em Kg - usa apenas campos de peso
        total = (data.three_thirty_gram * 0.33) + (data.five_hundred_gram * 0.5) + (data.one_kg * 1)
    else:
        # Produto em Litros - usa apenas campos de volume
        total = (data.half_liter * 0.5) + (data.one_liter * 1) + (data.two_liter * 2) + (data.five_liter * 5)
    
    count_doc = {
        'id': str(uuid.uuid4()),
        'product_batch_id': batch_id,
        'half_liter': data.half_liter,
        'one_liter': data.one_liter,
        'two_liter': data.two_liter,
        'five_liter': data.five_liter,
        'three_thirty_gram': data.three_thirty_gram,
        'five_hundred_gram': data.five_hundred_gram,
        'one_kg': data.one_kg,
        'total': float(total),
        'unit': 'Kg' if is_weight else 'L',  # Salvar a unidade
        'operator': data.operator,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.counting.insert_one(count_doc)
    
    # Update batch total
    new_total = batch.get('total_bottled', 0.0) + total
    await db.product_batches.update_one(
        {'id': batch_id},
        {'$set': {'total_bottled': new_total}}
    )
    
    # Check if batch is complete
    if new_total >= batch['planned_liters']:
        await db.product_batches.update_one(
            {'id': batch_id},
            {'$set': {'status': 'finalizado'}}
        )
    
    return Counting(**count_doc)

# ========== FUNCIONÁRIO DESTAQUE ==========

@api_router.get('/counting/top-operator/month')
async def get_top_operator_month(current_user = Depends(get_current_user)):
    """Retorna o funcionário que mais envasou no mês atual (apenas Litros)
    Inclui tanto contagens ativas quanto arquivadas do mês."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    current_year = now.year
    current_month = now.month
    
    # Agrupa por operador e soma os litros
    operator_totals = {}
    
    # 1. Buscar contagens ATIVAS do mês
    countings = await db.counting.find({
        'created_at': {'$gte': month_start}
    }, {'_id': 0}).to_list(10000)
    
    for c in countings:
        operator = c.get('operator', '').strip()
        if not operator:
            continue
        
        # Calcular total em LITROS apenas (campos de volume)
        half = c.get('half_liter', 0) or 0
        one = c.get('one_liter', 0) or 0
        two = c.get('two_liter', 0) or 0
        five = c.get('five_liter', 0) or 0
        
        total_litros = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
        
        if operator not in operator_totals:
            operator_totals[operator] = {'total': 0, 'count': 0}
        operator_totals[operator]['total'] += total_litros
        operator_totals[operator]['count'] += 1
    
    # 2. Buscar contagens dos lotes ARQUIVADOS do mês atual
    archived_batches = await db.archived_product_batches.find({
        'archived_year': current_year,
        'archived_month': current_month
    }, {'_id': 0}).to_list(10000)
    
    for batch in archived_batches:
        countings_history = batch.get('countings_history', [])
        for c in countings_history:
            operator = c.get('operator', '').strip()
            if not operator:
                continue
            
            # Calcular total em LITROS apenas
            half = c.get('half_liter', 0) or 0
            one = c.get('one_liter', 0) or 0
            two = c.get('two_liter', 0) or 0
            five = c.get('five_liter', 0) or 0
            
            total_litros = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
            
            if operator not in operator_totals:
                operator_totals[operator] = {'total': 0, 'count': 0}
            operator_totals[operator]['total'] += total_litros
            operator_totals[operator]['count'] += 1
    
    if not operator_totals:
        return None
    
    # Encontra o operador com maior total
    top = max(operator_totals.items(), key=lambda x: x[1]['total'])
    
    return {
        'name': top[0],
        'total_litros': round(top[1]['total'], 2),
        'count_entries': top[1]['count']
    }

# ========== TEAM ==========

@api_router.get('/team', response_model=List[TeamMember])
async def get_team(current_user = Depends(get_current_user)):
    members = await db.team.find({'deleted': False}, {'_id': 0}).to_list(1000)
    return members

@api_router.post('/team', response_model=TeamMember)
async def create_team_member(data: TeamMemberCreate, current_user = Depends(get_current_user)):
    import uuid
    member_id = str(uuid.uuid4())
    member_doc = {
        'id': member_id,
        'name': data.name,
        'role': data.role,
        'active': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False
    }
    await db.team.insert_one(member_doc)
    return TeamMember(**member_doc)

@api_router.put('/team/{member_id}', response_model=TeamMember)
async def update_team_member(member_id: str, data: TeamMemberCreate, current_user = Depends(get_current_user)):
    result = await db.team.update_one(
        {'id': member_id},
        {'$set': {'name': data.name, 'role': data.role}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Member not found')
    member = await db.team.find_one({'id': member_id}, {'_id': 0})
    return TeamMember(**member)

@api_router.delete('/team/{member_id}')
async def delete_team_member(member_id: str, current_user = Depends(get_current_user)):
    member = await db.team.find_one({'id': member_id}, {'_id': 0})
    if not member:
        raise HTTPException(status_code=404, detail='Member not found')
    
    await db.trash.insert_one({
        'id': str(__import__('uuid').uuid4()),
        'item_type': 'team_member',
        'item_data': member,
        'deleted_at': datetime.now(timezone.utc).isoformat()
    })
    await db.team.update_one({'id': member_id}, {'$set': {'deleted': True}})
    return {'message': 'Member moved to trash'}

# ========== SUPPLIERS ==========

@api_router.get('/suppliers', response_model=List[Supplier])
async def get_suppliers(current_user = Depends(get_current_user)):
    suppliers = await db.suppliers.find({'deleted': False}, {'_id': 0}).to_list(1000)
    return suppliers

@api_router.post('/suppliers', response_model=Supplier)
async def create_supplier(data: SupplierCreate, current_user = Depends(get_current_user)):
    import uuid
    supplier_id = str(uuid.uuid4())
    supplier_doc = {
        'id': supplier_id,
        'name': data.name,
        'contact': data.contact,
        'phone': data.phone,
        'email': data.email,
        'address': data.address,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False
    }
    await db.suppliers.insert_one(supplier_doc)
    return Supplier(**supplier_doc)

@api_router.put('/suppliers/{supplier_id}', response_model=Supplier)
async def update_supplier(supplier_id: str, data: SupplierCreate, current_user = Depends(get_current_user)):
    result = await db.suppliers.update_one(
        {'id': supplier_id},
        {'$set': {
            'name': data.name,
            'contact': data.contact,
            'phone': data.phone,
            'email': data.email,
            'address': data.address
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Supplier not found')
    supplier = await db.suppliers.find_one({'id': supplier_id}, {'_id': 0})
    return Supplier(**supplier)

@api_router.delete('/suppliers/{supplier_id}')
async def delete_supplier(supplier_id: str, current_user = Depends(get_current_user)):
    supplier = await db.suppliers.find_one({'id': supplier_id}, {'_id': 0})
    if not supplier:
        raise HTTPException(status_code=404, detail='Supplier not found')
    
    await db.trash.insert_one({
        'id': str(__import__('uuid').uuid4()),
        'item_type': 'supplier',
        'item_data': supplier,
        'deleted_at': datetime.now(timezone.utc).isoformat()
    })
    await db.suppliers.update_one({'id': supplier_id}, {'$set': {'deleted': True}})
    return {'message': 'Supplier moved to trash'}

# ========== EMPLOYEE HISTORY ==========

@api_router.get('/team/{member_id}/history')
async def get_employee_history(member_id: str, current_user = Depends(get_current_user)):
    """
    Retorna o histórico de envasamento de um funcionário (apenas LITROS do mês atual).
    Inclui tanto contagens ativas quanto arquivadas do mês.
    """
    member = await db.team.find_one({'id': member_id}, {'_id': 0})
    if not member:
        raise HTTPException(status_code=404, detail='Team member not found')
    
    member_name = member['name'].strip()  # Remover espaços extras
    
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    current_year = now.year
    current_month = now.month
    
    history = []
    total_litros = 0
    
    # 1. Buscar contagens ATIVAS do mês atual deste operador
    # Buscar todas as contagens do mês e filtrar pelo nome (com strip)
    all_countings = await db.counting.find(
        {'created_at': {'$gte': month_start}},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    # Filtrar pelo operador (comparando com strip)
    countings = [c for c in all_countings if c.get('operator', '').strip() == member_name]
    
    # Buscar informações dos lotes relacionados
    batch_ids = list(set([c['product_batch_id'] for c in countings]))
    batches = await db.product_batches.find(
        {'id': {'$in': batch_ids}},
        {'_id': 0}
    ).to_list(1000)
    
    batch_map = {b['id']: b for b in batches}
    
    # Buscar produtos
    product_ids = list(set([b.get('product_id') for b in batches if b.get('product_id')]))
    products = await db.products.find(
        {'id': {'$in': product_ids}},
        {'_id': 0}
    ).to_list(1000)
    
    product_map = {p['id']: p for p in products}
    
    for counting in countings:
        batch = batch_map.get(counting['product_batch_id'])
        if batch:
            product = product_map.get(batch.get('product_id'))
            
            half = counting.get('half_liter', 0) or 0
            one = counting.get('one_liter', 0) or 0
            two = counting.get('two_liter', 0) or 0
            five = counting.get('five_liter', 0) or 0
            
            litros = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
            
            history.append({
                'id': counting['id'],
                'date': counting['created_at'],
                'product_name': product['name'] if product else 'N/A',
                'batch_number': batch['batch_number'],
                'half_liter': half,
                'one_liter': one,
                'two_liter': two,
                'five_liter': five,
                'total_litros': litros,
                'archived': False
            })
            
            total_litros += litros
    
    # 2. Buscar contagens dos lotes ARQUIVADOS do mês atual
    archived_batches = await db.archived_product_batches.find({
        'archived_year': current_year,
        'archived_month': current_month
    }, {'_id': 0}).to_list(10000)
    
    # Buscar produtos para os arquivados
    archived_product_ids = list(set([b.get('product_id') for b in archived_batches if b.get('product_id')]))
    archived_products = await db.products.find(
        {'id': {'$in': archived_product_ids}},
        {'_id': 0}
    ).to_list(1000)
    
    archived_product_map = {p['id']: p for p in archived_products}
    
    for batch in archived_batches:
        countings_history = batch.get('countings_history', [])
        product = archived_product_map.get(batch.get('product_id'))
        
        for c in countings_history:
            if c.get('operator', '').strip() != member_name:
                continue
            
            half = c.get('half_liter', 0) or 0
            one = c.get('one_liter', 0) or 0
            two = c.get('two_liter', 0) or 0
            five = c.get('five_liter', 0) or 0
            
            litros = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
            
            history.append({
                'id': c.get('id', ''),
                'date': c.get('created_at', ''),
                'product_name': product['name'] if product else 'N/A',
                'batch_number': batch['batch_number'],
                'half_liter': half,
                'one_liter': one,
                'two_liter': two,
                'five_liter': five,
                'total_litros': litros,
                'archived': True
            })
            
            total_litros += litros
    
    # Ordenar por data (mais recente primeiro)
    history.sort(key=lambda x: x.get('date', ''), reverse=True)
    
    return {
        'member': member,
        'mes_atual': now.strftime('%B/%Y'),
        'total_litros': round(total_litros, 2),
        'total_operations': len(history),
        'history': history
    }

# ========== TRASH ==========

@api_router.get('/trash', response_model=List[TrashItem])
async def get_trash(current_user = Depends(get_current_user)):
    items = await db.trash.find({}, {'_id': 0}).to_list(1000)
    return items

@api_router.post('/trash/restore/{item_id}')
async def restore_from_trash(item_id: str, current_user = Depends(get_current_user)):
    trash_item = await db.trash.find_one({'id': item_id}, {'_id': 0})
    if not trash_item:
        raise HTTPException(status_code=404, detail='Item not found')
    
    item_type = trash_item['item_type']
    item_data = trash_item['item_data']
    
    collection_map = {
        'product': 'products',
        'product_batch': 'product_batches',
        'raw_material': 'raw_materials',
        'raw_material_batch': 'raw_material_batches',
        'production_order': 'production_orders',
        'team_member': 'team'
    }
    
    if item_type in collection_map:
        await db[collection_map[item_type]].update_one(
            {'id': item_data['id']},
            {'$set': {'deleted': False}}
        )
        await db.trash.delete_one({'id': item_id})
        return {'message': 'Item restored'}
    
    raise HTTPException(status_code=400, detail='Unknown item type')

@api_router.delete('/trash/{item_id}')
async def delete_from_trash_permanently(item_id: str, current_user = Depends(get_current_user)):
    result = await db.trash.delete_one({'id': item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Item not found')
    return {'message': 'Item permanently deleted'}

# ========== MONTHLY ARCHIVE ==========

@api_router.post('/archive/auto-archive-month')
async def auto_archive_finished_items(current_user = Depends(get_current_user)):
    """
    Arquiva automaticamente TODOS os itens finalizados, independente do mês.
    Inclui informações de quem fez o envase.
    """
    now = datetime.now(timezone.utc)
    
    # Mover lotes de produtos finalizados
    product_batches = await db.product_batches.find({
        'status': 'finalizado',
        'deleted': False
    }, {'_id': 0}).to_list(10000)
    
    archived_products = 0
    for batch in product_batches:
        batch_date = datetime.fromisoformat(batch['date'])
        
        # Buscar contagens deste lote para pegar operadores
        countings = await db.counting.find({'product_batch_id': batch['id']}, {'_id': 0}).to_list(1000)
        operators = list(set([c.get('operator', 'N/A') for c in countings if c.get('operator')]))
        
        # Adicionar info de arquivo
        batch['archived_year'] = batch_date.year
        batch['archived_month'] = batch_date.month
        batch['archived_at'] = now.isoformat()
        batch['operators'] = operators  # Lista de quem fez envase
        batch['countings_history'] = countings  # Histórico completo
        
        await db.archived_product_batches.insert_one(batch)
        await db.product_batches.delete_one({'id': batch['id']})
        # Também mover as contagens para histórico
        if countings:
            await db.counting.delete_many({'product_batch_id': batch['id']})
        archived_products += 1
    
    # Mover lotes de matérias-primas finalizados OU zerados
    rm_batches = await db.raw_material_batches.find({
        '$or': [
            {'status': 'finalizado'},
            {'quantity': {'$lte': 0}}  # Incluir lotes zerados
        ],
        'deleted': False
    }, {'_id': 0}).to_list(10000)
    
    archived_materials = 0
    for batch in rm_batches:
        batch_date = datetime.fromisoformat(batch['date'])
        batch['archived_year'] = batch_date.year
        batch['archived_month'] = batch_date.month
        batch['archived_at'] = now.isoformat()
        
        await db.archived_raw_material_batches.insert_one(batch)
        await db.raw_material_batches.delete_one({'id': batch['id']})
        archived_materials += 1
    
    return {
        'message': 'Auto-archive completed',
        'archived_products': archived_products,
        'archived_materials': archived_materials
    }

@api_router.get('/archive/months')
async def get_archive_months(current_user = Depends(get_current_user)):
    """
    Retorna lista de meses que possuem itens arquivados.
    """
    # Combinar e criar lista única
    months_set = set()
    
    prod_archives = await db.archived_product_batches.find({}, {'_id': 0, 'archived_year': 1, 'archived_month': 1}).to_list(10000)
    for item in prod_archives:
        months_set.add((item['archived_year'], item['archived_month']))
    
    rm_archives = await db.archived_raw_material_batches.find({}, {'_id': 0, 'archived_year': 1, 'archived_month': 1}).to_list(10000)
    for item in rm_archives:
        months_set.add((item['archived_year'], item['archived_month']))
    
    # Converter para lista e ordenar
    months_list = sorted(list(months_set), reverse=True)
    
    month_names = {
        1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
        5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
        9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    }
    
    result = [
        {
            'year': year,
            'month': month,
            'month_name': f'{month_names[month]} de {year}'
        }
        for year, month in months_list
    ]
    
    return result

@api_router.get('/archive/products/{year}/{month}')
async def get_archived_products(year: int, month: int, current_user = Depends(get_current_user)):
    """
    Retorna lotes de produtos arquivados de um mês específico.
    """
    batches = await db.archived_product_batches.find({
        'archived_year': year,
        'archived_month': month
    }, {'_id': 0}).to_list(10000)
    
    return batches

@api_router.get('/archive/by-product/{product_id}')
async def get_archived_by_product(product_id: str, current_user = Depends(get_current_user)):
    """
    Retorna TODOS os lotes arquivados de um produto específico, independente do mês.
    """
    batches = await db.archived_product_batches.find({
        'product_id': product_id
    }, {'_id': 0}).sort('archived_at', -1).to_list(10000)
    
    return batches


@api_router.get('/archive/all-product-batches')
async def get_all_archived_product_batches(current_user = Depends(get_current_user)):
    """
    Retorna TODOS os lotes de produtos arquivados (qualquer mês, qualquer produto).
    Usado para resolver lote/data ao imprimir etiquetas de amostras antigas.
    """
    batches = await db.archived_product_batches.find(
        {}, {'_id': 0}
    ).sort('archived_at', -1).to_list(20000)
    return batches


@api_router.get('/archive/raw-materials/{year}/{month}')
async def get_archived_raw_materials(year: int, month: int, current_user = Depends(get_current_user)):
    """
    Retorna lotes de matérias-primas arquivados de um mês específico.
    """
    batches = await db.archived_raw_material_batches.find({
        'archived_year': year,
        'archived_month': month
    }, {'_id': 0}).to_list(10000)
    
    return batches

# Email do laboratório autorizado a editar
LAB_EMAIL = 'laboratoriolumix@outlook.com'

class CountingEdit(BaseModel):
    half_liter: int = 0
    one_liter: int = 0
    two_liter: int = 0
    five_liter: int = 0
    three_thirty_gram: int = 0
    five_hundred_gram: int = 0
    one_kg: int = 0
    operator: str

@api_router.get('/archive/operators-summary/{year}/{month}')
async def get_archive_operators_summary(year: int, month: int, current_user = Depends(get_current_user)):
    """
    Retorna o resumo de litragens por funcionário nos lotes arquivados de um mês específico.
    """
    batches = await db.archived_product_batches.find({
        'archived_year': year,
        'archived_month': month
    }, {'_id': 0}).to_list(10000)
    
    # Agrupar litragens por operador
    operator_totals = {}
    
    for batch in batches:
        countings = batch.get('countings_history', [])
        for c in countings:
            operator = c.get('operator', '').strip()
            if not operator:
                continue
            
            # Calcular litros (apenas campos de volume)
            half = c.get('half_liter', 0) or 0
            one = c.get('one_liter', 0) or 0
            two = c.get('two_liter', 0) or 0
            five = c.get('five_liter', 0) or 0
            
            litros = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
            
            if operator not in operator_totals:
                operator_totals[operator] = {'total_litros': 0, 'operacoes': 0}
            operator_totals[operator]['total_litros'] += litros
            operator_totals[operator]['operacoes'] += 1
    
    # Converter para lista ordenada por total
    result = []
    for op, data in sorted(operator_totals.items(), key=lambda x: x[1]['total_litros'], reverse=True):
        result.append({
            'operador': op,
            'total_litros': round(data['total_litros'], 2),
            'operacoes': data['operacoes']
        })
    
    return result

@api_router.put('/archive/counting/{batch_id}/{counting_id}')
async def edit_archived_counting(batch_id: str, counting_id: str, data: CountingEdit, current_user = Depends(get_current_user)):
    """
    Edita uma contagem arquivada. Apenas disponível para o email do laboratório.
    """
    # Verificar se é o usuário do laboratório
    if current_user.get('email', '').lower() != LAB_EMAIL.lower():
        raise HTTPException(status_code=403, detail='Apenas o laboratório pode editar contagens arquivadas')
    
    # Buscar o lote arquivado
    batch = await db.archived_product_batches.find_one({'id': batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail='Lote arquivado não encontrado')
    
    # Encontrar a contagem no histórico
    countings = batch.get('countings_history', [])
    counting_index = None
    old_total = 0
    
    for i, c in enumerate(countings):
        if c.get('id') == counting_id:
            counting_index = i
            old_total = c.get('total', 0)
            break
    
    if counting_index is None:
        raise HTTPException(status_code=404, detail='Contagem não encontrada')
    
    # Calcular novo total
    volume_total = (data.half_liter * 0.5) + (data.one_liter * 1) + (data.two_liter * 2) + (data.five_liter * 5)
    weight_total = (data.three_thirty_gram * 0.33) + (data.five_hundred_gram * 0.5) + (data.one_kg * 1)
    new_total = volume_total + weight_total
    
    # Atualizar a contagem no histórico
    countings[counting_index]['half_liter'] = data.half_liter
    countings[counting_index]['one_liter'] = data.one_liter
    countings[counting_index]['two_liter'] = data.two_liter
    countings[counting_index]['five_liter'] = data.five_liter
    countings[counting_index]['three_thirty_gram'] = data.three_thirty_gram
    countings[counting_index]['five_hundred_gram'] = data.five_hundred_gram
    countings[counting_index]['one_kg'] = data.one_kg
    countings[counting_index]['operator'] = data.operator
    countings[counting_index]['total'] = new_total
    countings[counting_index]['edited_at'] = datetime.now(timezone.utc).isoformat()
    countings[counting_index]['edited_by'] = current_user.get('email')
    
    # Recalcular total envasado do lote
    total_diff = new_total - old_total
    new_batch_total = batch.get('total_bottled', 0) + total_diff
    
    # Atualizar operadores (recalcular lista única)
    operators = list(set([c.get('operator', '') for c in countings if c.get('operator')]))
    
    # Salvar no banco
    await db.archived_product_batches.update_one(
        {'id': batch_id},
        {'$set': {
            'countings_history': countings,
            'total_bottled': new_batch_total,
            'operators': operators
        }}
    )
    
    return {'message': 'Contagem atualizada com sucesso', 'new_total': new_batch_total}

class ArchivedBatchEdit(BaseModel):
    batch_number: str
    planned_liters: float
    total_bottled: float
    operators: List[str] = []

@api_router.put('/archive/batch/{batch_id}')
async def edit_archived_batch(batch_id: str, data: ArchivedBatchEdit, current_user = Depends(get_current_user)):
    """
    Edita um lote arquivado (número do lote, litragem planejada/envasada, operadores).
    Apenas disponível para o email do laboratório.
    """
    # Verificar se é o usuário do laboratório
    if current_user.get('email', '').lower() != LAB_EMAIL.lower():
        raise HTTPException(status_code=403, detail='Apenas o laboratório pode editar lotes arquivados')
    
    # Buscar o lote arquivado
    batch = await db.archived_product_batches.find_one({'id': batch_id})
    if not batch:
        raise HTTPException(status_code=404, detail='Lote arquivado não encontrado')
    
    # Atualizar os dados
    await db.archived_product_batches.update_one(
        {'id': batch_id},
        {'$set': {
            'batch_number': data.batch_number,
            'planned_liters': data.planned_liters,
            'total_bottled': data.total_bottled,
            'operators': data.operators,
            'edited_at': datetime.now(timezone.utc).isoformat(),
            'edited_by': current_user.get('email')
        }}
    )
    
    return {'message': 'Lote atualizado com sucesso'}

# ========== DASHBOARD ==========

@api_router.get('/dashboard/summary', response_model=DashboardSummary)
async def get_dashboard_summary(current_user = Depends(get_current_user)):
    open_batches = await db.product_batches.count_documents({
        'status': {'$in': ['em_aberto', 'em_producao']}, 
        'deleted': False
    })
    in_production = await db.production_orders.count_documents({'status': 'em_producao', 'deleted': False})
    
    # Calculate liters bottled this month (APENAS LITROS)
    # Incluindo tanto contagens ativas quanto arquivadas do mês
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    current_year = now.year
    current_month = now.month
    
    total_liters = 0
    
    # 1. Contagens ativas do mês
    active_counts = await db.counting.find(
        {'created_at': {'$gte': month_start}},
        {'_id': 0}
    ).to_list(10000)
    
    for c in active_counts:
        half = c.get('half_liter', 0) or 0
        one = c.get('one_liter', 0) or 0
        two = c.get('two_liter', 0) or 0
        five = c.get('five_liter', 0) or 0
        total_liters += (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
    
    # 2. Contagens de lotes arquivados do mês atual
    archived_batches = await db.archived_product_batches.find({
        'archived_year': current_year,
        'archived_month': current_month
    }, {'_id': 0}).to_list(10000)
    
    for batch in archived_batches:
        countings_history = batch.get('countings_history', [])
        for c in countings_history:
            half = c.get('half_liter', 0) or 0
            one = c.get('one_liter', 0) or 0
            two = c.get('two_liter', 0) or 0
            five = c.get('five_liter', 0) or 0
            total_liters += (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
    
    return DashboardSummary(
        open_batches=open_batches,
        in_production_orders=in_production,
        liters_bottled_month=total_liters
    )

@api_router.post('/dashboard/reset-liters')
async def reset_liters_counter(current_user = Depends(get_current_user)):
    """
    Remove todas as contagens do mês atual para resetar o contador de litros.
    """
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    result = await db.counting.delete_many({'created_at': {'$gte': month_start}})
    
    return {
        'message': 'Contador resetado com sucesso',
        'deleted_count': result.deleted_count
    }

@api_router.post('/dashboard/recalculate-liters')
async def recalculate_liters_counter(current_user = Depends(get_current_user)):
    """
    Recalcula a litragem total do mês atual somando:
    1. Contagens ativas do mês
    2. Contagens de lotes arquivados do mês
    
    Retorna o total calculado (apenas LITROS, não Kg).
    """
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    current_year = now.year
    current_month = now.month
    
    total_from_active = 0
    total_from_archived = 0
    
    # 1. Somar contagens ATIVAS do mês (apenas Litros)
    active_counts = await db.counting.find(
        {'created_at': {'$gte': month_start}},
        {'_id': 0}
    ).to_list(10000)
    
    for c in active_counts:
        # Calcular apenas campos de volume (Litros)
        half = c.get('half_liter', 0) or 0
        one = c.get('one_liter', 0) or 0
        two = c.get('two_liter', 0) or 0
        five = c.get('five_liter', 0) or 0
        total_from_active += (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
    
    # 2. Somar contagens de lotes ARQUIVADOS do mês atual (apenas Litros)
    archived_batches = await db.archived_product_batches.find({
        'archived_year': current_year,
        'archived_month': current_month
    }, {'_id': 0}).to_list(10000)
    
    for batch in archived_batches:
        countings_history = batch.get('countings_history', [])
        for c in countings_history:
            half = c.get('half_liter', 0) or 0
            one = c.get('one_liter', 0) or 0
            two = c.get('two_liter', 0) or 0
            five = c.get('five_liter', 0) or 0
            total_from_archived += (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
    
    total_liters = total_from_active + total_from_archived
    
    return {
        'message': 'Litragem recalculada com sucesso',
        'total_liters': round(total_liters, 2),
        'from_active': round(total_from_active, 2),
        'from_archived': round(total_from_archived, 2),
        'month': current_month,
        'year': current_year
    }

@api_router.get('/dashboard/chart/daily')
async def get_daily_production_chart(current_user = Depends(get_current_user)):
    """
    Retorna dados de produção diária dos últimos 30 dias.
    Inclui contagens ativas e contagens de lotes arquivados.
    """
    from collections import defaultdict

    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    daily_totals = defaultdict(float)

    # 1️⃣ Contagens de lotes ativos
    active_counts = await db.counting.find(
        {'created_at': {'$gte': thirty_days_ago}},
        {'_id': 0}
    ).to_list(10000)

    for c in active_counts:
        created_at = c.get('created_at', '')[:10]

        half = c.get('half_liter', 0) or 0
        one = c.get('one_liter', 0) or 0
        two = c.get('two_liter', 0) or 0
        five = c.get('five_liter', 0) or 0

        total = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)

        daily_totals[created_at] += total

    # 2️⃣ Contagens de lotes arquivados
    archived_batches = await db.archived_product_batches.find(
        {},
        {'_id': 0, 'countings_history': 1}
    ).to_list(10000)

    for batch in archived_batches:
        for c in batch.get('countings_history', []):

            created_at_full = c.get('created_at')
            if not created_at_full:
                continue

            if created_at_full < thirty_days_ago:
                continue

            created_at = created_at_full[:10]

            half = c.get('half_liter', 0) or 0
            one = c.get('one_liter', 0) or 0
            two = c.get('two_liter', 0) or 0
            five = c.get('five_liter', 0) or 0

            total = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)

            daily_totals[created_at] += total

    result = []

    for date_str, total in sorted(daily_totals.items()):
        day = datetime.fromisoformat(date_str).strftime('%d/%m')

        result.append({
            'date': date_str,
            'day': day,
            'liters': round(total, 1)
        })

    return result
    # Converter para lista ordenada por data
    result = []
    for date_str, total in sorted(daily_totals.items()):
        day = datetime.fromisoformat(date_str).strftime('%d/%m')
        result.append({
            'date': date_str,
            'day': day,
            'liters': round(total, 1)
        })
    
    return result

@api_router.get('/dashboard/chart/monthly')
async def get_monthly_production_chart(current_user = Depends(get_current_user)):
    """
    Retorna dados de produção mensal dos últimos 12 meses.
    Inclui contagens ativas e contagens de lotes arquivados.
    """
    from collections import defaultdict

    now = datetime.now(timezone.utc)
    current_year = now.year
    current_month = now.month

    monthly_totals = defaultdict(float)

    # gerar últimos 12 meses
    months_data = []
    for i in range(11, -1, -1):
        month = current_month - i
        year = current_year

        while month <= 0:
            month += 12
            year -= 1

        months_data.append({'year': year, 'month': month})

    # -------------------------
    # 1️⃣ CONTAGENS ATIVAS
    # -------------------------

    active_counts = await db.counting.find({}, {'_id': 0}).to_list(10000)

    for c in active_counts:

        created = c.get('created_at')
        if not created:
            continue

        dt = datetime.fromisoformat(created)
        key = f"{dt.year}-{dt.month}"

        half = c.get('half_liter', 0) or 0
        one = c.get('one_liter', 0) or 0
        two = c.get('two_liter', 0) or 0
        five = c.get('five_liter', 0) or 0

        total = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)

        monthly_totals[key] += total

    # -------------------------
    # 2️⃣ CONTAGENS ARQUIVADAS
    # -------------------------

    archived_batches = await db.archived_product_batches.find(
        {},
        {'_id': 0, 'countings_history': 1}
    ).to_list(10000)

    for batch in archived_batches:

        for c in batch.get('countings_history', []):

            created = c.get('created_at')
            if not created:
                continue

            dt = datetime.fromisoformat(created)
            key = f"{dt.year}-{dt.month}"

            half = c.get('half_liter', 0) or 0
            one = c.get('one_liter', 0) or 0
            two = c.get('two_liter', 0) or 0
            five = c.get('five_liter', 0) or 0

            total = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)

            monthly_totals[key] += total

    # -------------------------
    # GERAR RESULTADO FINAL
    # -------------------------

    result = []

    for m in months_data:

        key = f"{m['year']}-{m['month']}"

        month_name = datetime(m['year'], m['month'], 1).strftime('%b/%y')

        result.append({
            "month": month_name,
            "liters": round(monthly_totals.get(key, 0), 1)
        })

    return result

# ========== LAUDOS ROUTES ==========

@api_router.get('/laudos/folders')
async def list_laudo_folders(current_user = Depends(get_current_user)):
    """Lista todas as pastas de laudos"""
    folders = await db.laudo_folders.find({'deleted': False}, {'_id': 0}).to_list(1000)
    return folders

@api_router.post('/laudos/folders')
async def create_laudo_folder(
    folder_data: LaudoFolderCreate,
    current_user = Depends(get_current_user)
):
    """Criar nova pasta de laudos"""
    folder = LaudoFolder(
        id=str(uuid4()),
        name=folder_data.name,
        parent_id=folder_data.parent_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        created_by=current_user['id'],
        deleted=False
    )
    
    await db.laudo_folders.insert_one(folder.dict())
    return folder

@api_router.delete('/laudos/folders/{folder_id}')
async def delete_laudo_folder(
    folder_id: str,
    current_user = Depends(get_current_user)
):
    """Deletar pasta de laudos"""
    # Verificar se tem arquivos
    files_count = await db.laudo_files.count_documents({'folder_id': folder_id, 'deleted': False})
    if files_count > 0:
        raise HTTPException(status_code=400, detail='Pasta contém arquivos. Remova os arquivos primeiro.')
    
    await db.laudo_folders.update_one(
        {'id': folder_id},
        {'$set': {'deleted': True}}
    )
    
    return {'message': 'Pasta deletada com sucesso'}


@api_router.put('/laudos/folders/{folder_id}')
async def rename_laudo_folder(
    folder_id: str,
    data: dict = Body(...),
    current_user = Depends(get_current_user)
):
    """Renomeia uma pasta de laudos"""
    new_name = (data.get('name') or '').strip()
    if not new_name:
        raise HTTPException(status_code=400, detail='Nome inválido')
    result = await db.laudo_folders.update_one(
        {'id': folder_id, 'deleted': False},
        {'$set': {'name': new_name}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Pasta não encontrada')
    return {'message': 'Pasta renomeada', 'name': new_name}

@api_router.post('/laudos/upload')
async def upload_laudo(
    folder_id: str,
    notes: str = '',
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    """Upload de arquivo PDF de laudo"""
    
    # Validar extensão
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Apenas arquivos PDF são permitidos')
    
    # Upload para GridFS
    file_content = await file.read()
    file_id = await fs.upload_from_stream(
        file.filename,
        io.BytesIO(file_content),
        metadata={
            'content_type': file.content_type,
            'uploaded_by': current_user['id'],
            'uploaded_at': datetime.now(timezone.utc).isoformat(),
            'folder_id': folder_id
        }
    )
    
    # Criar registro
    laudo_file = LaudoFile(
        id=str(uuid4()),
        folder_id=folder_id,
        file_id=str(file_id),
        filename=file.filename,
        content_type=file.content_type,
        size=len(file_content),
        uploaded_at=datetime.now(timezone.utc).isoformat(),
        uploaded_by=current_user['id'],
        uploaded_by_name=current_user['name'],
        notes=notes,
        deleted=False
    )
    
    await db.laudo_files.insert_one(laudo_file.dict())
    
    return laudo_file

@api_router.get('/laudos/files/{folder_id}')
async def list_laudo_files(
    folder_id: str,
    current_user = Depends(get_current_user)
):
    """Listar arquivos de uma pasta"""
    files = await db.laudo_files.find(
        {'folder_id': folder_id, 'deleted': False},
        {'_id': 0}
    ).sort('uploaded_at', -1).to_list(1000)
    
    return files

@api_router.get('/laudos/download/{file_id}')
async def download_laudo(
    file_id: str,
    current_user = Depends(get_current_user)
):
    """Download de arquivo de laudo"""
    
    # Buscar metadata
    laudo = await db.laudo_files.find_one({'id': file_id, 'deleted': False}, {'_id': 0})
    if not laudo:
        raise HTTPException(status_code=404, detail='Arquivo não encontrado')
    
    # Download do GridFS
    try:
        from bson import ObjectId
        grid_out = await fs.open_download_stream(ObjectId(laudo['file_id']))
        content = await grid_out.read()
        
        return StreamingResponse(
            io.BytesIO(content),
            media_type=laudo['content_type'],
            headers={
                'Content-Disposition': f'attachment; filename="{laudo["filename"]}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f'Erro ao baixar arquivo: {str(e)}')

@api_router.delete('/laudos/files/{file_id}')
async def delete_laudo_file(
    file_id: str,
    current_user = Depends(get_current_user)
):
    """Deletar arquivo de laudo"""
    await db.laudo_files.update_one(
        {'id': file_id},
        {'$set': {'deleted': True}}
    )
    
    return {'message': 'Arquivo deletado com sucesso'}


@api_router.put('/laudos/files/{file_id}')
async def rename_laudo_file(
    file_id: str,
    data: dict = Body(...),
    current_user = Depends(get_current_user)
):
    """Renomeia um arquivo de laudo (apenas o nome exibido, mantém a extensão)."""
    new_name = (data.get('filename') or '').strip()
    if not new_name:
        raise HTTPException(status_code=400, detail='Nome inválido')
    # Preserva a extensão original se o usuário não incluiu uma
    doc = await db.laudo_files.find_one({'id': file_id, 'deleted': {'$ne': True}}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail='Arquivo não encontrado')
    original = doc.get('filename', '')
    if '.' in original and '.' not in new_name:
        ext = original.rsplit('.', 1)[1]
        new_name = f"{new_name}.{ext}"
    await db.laudo_files.update_one({'id': file_id}, {'$set': {'filename': new_name}})
    return {'message': 'Arquivo renomeado', 'filename': new_name}

# ========== AMOSTRAS ROUTES ==========

@api_router.get('/samples')
async def get_samples(current_user = Depends(get_current_user)):
    """Retorna todas as amostras pendentes e retiradas"""
    samples = await db.samples.find({'deleted': {'$ne': True}}, {'_id': 0}).to_list(1000)
    return samples

@api_router.post('/samples/check-new/{batch_id}')
async def check_and_create_sample(batch_id: str, current_user = Depends(get_current_user)):
    """Verifica se é o primeiro lote do produto no mês e cria amostra se necessário"""
    import uuid
    
    # Buscar o lote
    batch = await db.product_batches.find_one({'id': batch_id}, {'_id': 0})
    if not batch:
        return {'created': False, 'reason': 'Lote não encontrado'}
    
    batch_date = datetime.fromisoformat(batch['date'])
    month = batch_date.month
    year = batch_date.year
    product_id = batch['product_id']
    
    # Verificar se já existe amostra para este produto neste mês
    existing = await db.samples.find_one({
        'product_id': product_id,
        'month': month,
        'year': year,
        'deleted': {'$ne': True}
    })
    
    if existing:
        return {'created': False, 'reason': 'Já existe amostra para este produto neste mês'}
    
    # Criar nova solicitação de amostra
    sample = {
        'id': str(uuid.uuid4()),
        'product_id': product_id,
        'product_batch_id': batch_id,
        'month': month,
        'year': year,
        'status': 'pendente',
        'requested_at': datetime.now(timezone.utc).isoformat(),
        'collected_by': None,
        'collected_at': None
    }
    
    await db.samples.insert_one(sample)
    return {'created': True, 'sample': sample}

@api_router.put('/samples/{sample_id}/collect')
async def collect_sample(sample_id: str, collected_by: str, current_user = Depends(get_current_user)):
    """Marca amostra como retirada"""
    result = await db.samples.update_one(
        {'id': sample_id},
        {'$set': {
            'status': 'retirado',
            'collected_by': collected_by,
            'collected_at': datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail='Amostra não encontrada')
    
    return {'message': 'Amostra marcada como retirada'}

# ========== DOCUMENT GENERATION ROUTES ==========

@api_router.post('/industrial-ops/{op_id}/generate-documents')
async def generate_op_documents(
    op_id: str,
    current_user = Depends(get_current_user)
):
    """Gerar PDFs preenchidos a partir dos templates do produto"""
    from document_generator import generate_documents_from_templates
    
    # Buscar OP
    op = await db.industrial_ops.find_one({'id': op_id}, {'_id': 0})
    if not op:
        raise HTTPException(status_code=404, detail='OP não encontrada')
    
    # Buscar produto
    product = await db.products.find_one({'id': op['product_id'], 'deleted': False}, {'_id': 0})
    if not product:
        raise HTTPException(status_code=404, detail='Produto não encontrado')
    
    # Verificar se produto tem templates
    file_models = product.get('file_models', {})
    if not file_models.get('op_model') and not file_models.get('ficha_analise'):
        raise HTTPException(
            status_code=400,
            detail='Produto não possui templates cadastrados. Faça upload dos templates .docx e .xls primeiro.'
        )
    
    # Preparar dados das matérias-primas
    raw_materials_list = []
    for rm_usage in op.get('raw_materials', []):
        raw_materials_list.append({
            'name': rm_usage.get('raw_material_name', ''),
            'quantity': rm_usage.get('quantity_used', 0),
            'unit': rm_usage.get('unit', 'L'),
            'batch_number': rm_usage.get('batch_number', '')
        })
    
    # Baixar templates do GridFS
    docx_template_content = None
    excel_template_content = None
    
    if file_models.get('ficha_analise'):
        try:
            file_id = file_models['ficha_analise']['file_id']
            grid_out = await fs.open_download_stream(ObjectId(file_id))
            docx_template_content = await grid_out.read()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Erro ao baixar template .docx: {str(e)}')
    
    if file_models.get('op_model'):
        try:
            file_id = file_models['op_model']['file_id']
            grid_out = await fs.open_download_stream(ObjectId(file_id))
            excel_template_content = await grid_out.read()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Erro ao baixar template Excel: {str(e)}')
    
    # Preparar dados
    op_data = {
        'batch_number': op.get('batch_number', ''),
        'date': datetime.now(timezone.utc).strftime('%d/%m/%Y')
    }
    
    product_data = {
        'name': product['name']
    }
    
    # Gerar documentos
    try:
        documents = await generate_documents_from_templates(
            op_data,
            product_data,
            raw_materials_list,
            docx_template_content,
            excel_template_content
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Erro ao gerar documentos: {str(e)}')
    
    # Salvar PDFs no GridFS
    result = {
        'message': 'Documentos gerados com sucesso',
        'documents': []
    }
    
    if 'docx_pdf' in documents:
        file_id = await fs.upload_from_stream(
            f"FICHA_{product['name']}_{op['batch_number']}.pdf",
            io.BytesIO(documents['docx_pdf']),
            metadata={
                'type': 'ficha',
                'op_id': op_id,
                'product_id': op['product_id'],
                'batch_number': op['batch_number'],
                'generated_at': datetime.now(timezone.utc).isoformat()
            }
        )
        result['documents'].append({
            'type': 'ficha',
            'file_id': str(file_id),
            'filename': f"FICHA_{product['name']}_{op['batch_number']}.pdf"
        })
    
    if 'excel_pdf' in documents:
        file_id = await fs.upload_from_stream(
            f"OP_{product['name']}_{op['batch_number']}.pdf",
            io.BytesIO(documents['excel_pdf']),
            metadata={
                'type': 'op',
                'op_id': op_id,
                'product_id': op['product_id'],
                'batch_number': op['batch_number'],
                'generated_at': datetime.now(timezone.utc).isoformat()
            }
        )
        result['documents'].append({
            'type': 'op',
            'file_id': str(file_id),
            'filename': f"OP_{product['name']}_{op['batch_number']}.pdf"
        })
    
    return result

@api_router.get('/documents/download/{file_id}')
async def download_generated_document(
    file_id: str,
    current_user = Depends(get_current_user)
):
    """Download de documento gerado"""
    try:
        from bson import ObjectId
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        content = await grid_out.read()
        
        return StreamingResponse(
            io.BytesIO(content),
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{grid_out.filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f'Arquivo não encontrado: {str(e)}')

# ========== INDUSTRIAL OP ROUTES ==========
from industrial_op_routes import setup_industrial_op_routes
setup_industrial_op_routes(api_router, db, fs, get_current_user, generate_batch_number)


# ========== DOCUMENTAÇÃO DE PRODUÇÃO (Ficha + OP via templates oficiais) ==========
from services.documentation import (
    fill_ficha_template, fill_op_template, convert_to_pdf, _fmt_date_br,
    CUSTOM_TEMPLATES_DIR, CUSTOM_OP_TEMPLATES_DIR,
    get_ficha_template_path, get_op_template_path,
)
import tempfile
import xlrd


async def _build_documentation_payload(product_batch_id: str) -> dict:
    """
    Resolve product + batch + matérias-primas consumidas (com validade)
    para alimentar os templates. Procura o lote tanto em product_batches (ativo)
    quanto em archived_product_batches (lote arquivado).
    """
    batch = await db.product_batches.find_one({'id': product_batch_id}, {'_id': 0})
    if not batch:
        batch = await db.archived_product_batches.find_one({'id': product_batch_id}, {'_id': 0})
    if not batch:
        raise HTTPException(status_code=404, detail='Lote de produto não encontrado')

    product = await db.products.find_one({'id': batch.get('product_id')}, {'_id': 0})
    if not product:
        raise HTTPException(status_code=404, detail='Produto não encontrado')

    # OP number: usa o número do lote em si (formato AAMMNN) ou um número curto se houver
    op_number = batch.get('op_number')
    if not op_number:
        # tenta encontrar a ficha_analise gerada automaticamente para esse mês/produto
        from datetime import datetime as _dt
        try:
            dt = _dt.fromisoformat(str(batch.get('date')).split('T')[0])
            ficha = await db.fichas_analise.find_one({
                'product_id': product['id'],
                'month': dt.month,
                'year': dt.year
            }, {'_id': 0})
            if ficha:
                op_number = ficha.get('op_number')
        except Exception:
            pass
    op_number_str = str(op_number) if op_number else (batch.get('batch_number', '') or '')

    # Materiais consumidos
    materials = []
    consumed = batch.get('raw_materials_used') or []
    expected_liters = float(product.get('expected_liters') or 0)
    planned_liters = float(batch.get('planned_liters') or 0)

    if consumed:
        # Caso o lote tenha consumido MP (via LIFO)
        for mat in consumed:
            # Pega validade do primeiro lote consumido (mesmo finalizado/zerado)
            validade = ''
            lote_mp = ''
            for b in (mat.get('batches_consumed') or []):
                rm_b = await db.raw_material_batches.find_one(
                    {'id': b.get('batch_id')}, {'_id': 0}
                )
                if rm_b:
                    if rm_b.get('expiry_date'):
                        validade = _fmt_date_br(rm_b['expiry_date'])
                    lote_mp = rm_b.get('batch_number') or ''
                    if lote_mp:
                        break

            # Fallback: se o lote consumido foi deletado, busca o lote MAIS RECENTE
            # da MP em qualquer status (em_aberto, finalizado), ignorando só os
            # marcados como deleted=True.
            if not lote_mp:
                latest = await db.raw_material_batches.find(
                    {'raw_material_id': mat.get('raw_material_id'),
                     'deleted': {'$ne': True}},
                    {'_id': 0}
                ).sort('date', -1).limit(1).to_list(1)
                if latest:
                    lote_mp = latest[0].get('batch_number', '') or ''
                    if not validade and latest[0].get('expiry_date'):
                        validade = _fmt_date_br(latest[0]['expiry_date'])

            qty = float(mat.get('quantity_needed') or 0)
            # Percentual proporcional à litragem planejada (qty corresponde a planned_liters)
            pct = (qty / planned_liters * 100) if planned_liters > 0 else 0

            materials.append({
                'name': (mat.get('raw_material_name') or '').upper(),
                'lote': lote_mp,
                'validade': validade,
                'percent': round(pct, 4),
                'quantity_kg': round(qty, 4),
            })
    else:
        # Sem MP consumida ainda: usa a receita cadastrada do produto + lote MAIS RECENTE de cada MP
        recipes = product.get('recipes') or []
        for r in recipes:
            rm_id = r.get('raw_material_id')
            qty_per_recipe = float(r.get('quantity_per_liter') or 0)
            if expected_liters > 0:
                needed = qty_per_recipe * (planned_liters / expected_liters) if planned_liters else qty_per_recipe
            else:
                needed = qty_per_recipe
            pct = (needed / planned_liters * 100) if planned_liters > 0 else (qty_per_recipe / expected_liters * 100 if expected_liters else 0)

            rm = await db.raw_materials.find_one({'id': rm_id}, {'_id': 0})
            rm_name = (rm.get('name') if rm else '') or ''

            # Lote mais recente em QUALQUER status (em_aberto, finalizado/zerado),
            # excluindo só os deletados. Se a MP acabou, pega o último lote usado.
            latest = await db.raw_material_batches.find(
                {'raw_material_id': rm_id, 'deleted': {'$ne': True}},
                {'_id': 0}
            ).sort('date', -1).limit(1).to_list(1)
            lote_mp = latest[0].get('batch_number', '') if latest else ''
            validade = _fmt_date_br(latest[0].get('expiry_date')) if latest else ''

            materials.append({
                'name': rm_name.upper(),
                'lote': lote_mp,
                'validade': validade,
                'percent': round(pct, 4),
                'quantity_kg': round(needed, 4),
            })

    return {
        'product_name': (product.get('name') or '').upper(),
        'op_number': op_number_str,
        'lote_number': batch.get('batch_number') or '',
        'fab_date': _fmt_date_br(batch.get('date')),
        'quantity_liters': planned_liters,
        'materials': materials,
    }


@api_router.get('/documentation/{product_batch_id}/preview-data')
async def documentation_preview_data(
    product_batch_id: str,
    current_user = Depends(get_current_user)
):
    """Retorna os dados que serão usados para preencher os templates (preview)."""
    return await _build_documentation_payload(product_batch_id)


@api_router.get('/documentation/{product_batch_id}/{doc_type}')
async def generate_production_documentation(
    product_batch_id: str,
    doc_type: str,
    fmt: str = 'pdf',
    current_user = Depends(get_current_user)
):
    """
    Gera Ficha de Fabricação ou Ordem de Produção a partir dos templates oficiais
    com dados reais do lote.

    Parâmetros:
      - product_batch_id: id do lote do produto
      - doc_type: 'ficha' ou 'op'
      - fmt: 'pdf' (padrão) ou 'native' (docx/xls)
    """
    if doc_type not in ('ficha', 'op'):
        raise HTTPException(status_code=400, detail="doc_type deve ser 'ficha' ou 'op'")
    if fmt not in ('pdf', 'native'):
        raise HTTPException(status_code=400, detail="fmt deve ser 'pdf' ou 'native'")

    payload = await _build_documentation_payload(product_batch_id)

    tmpdir = tempfile.mkdtemp(prefix='lumix_doc_')
    safe_lote = (payload['lote_number'] or 'lote').replace('/', '-')
    safe_prod = (payload['product_name'] or 'produto').replace('/', '-').replace(' ', '_')

    try:
        if doc_type == 'ficha':
            out_path = os.path.join(tmpdir, f'ficha_{safe_prod}_{safe_lote}.docx')
            # usa template personalizado do produto se existir, senão o padrão
            batch_doc = await db.product_batches.find_one({'id': product_batch_id}, {'_id': 0, 'product_id': 1}) \
                or await db.archived_product_batches.find_one({'id': product_batch_id}, {'_id': 0, 'product_id': 1})
            product_id_for_tpl = batch_doc.get('product_id') if batch_doc else None
            template_path = get_ficha_template_path(product_id_for_tpl)
            fill_ficha_template(
                product_name=payload['product_name'],
                op_number=payload['op_number'],
                lote_number=payload['lote_number'],
                fab_date=payload['fab_date'],
                output_path=out_path,
                template_path=template_path,
            )
            mime_native = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            filename_native = f'Ficha_{safe_prod}_{safe_lote}.docx'
        else:
            out_path = os.path.join(tmpdir, f'op_{safe_prod}_{safe_lote}.xls')
            # usa template personalizado da OP se existir
            batch_doc_op = await db.product_batches.find_one({'id': product_batch_id}, {'_id': 0, 'product_id': 1}) \
                or await db.archived_product_batches.find_one({'id': product_batch_id}, {'_id': 0, 'product_id': 1})
            product_id_for_op = batch_doc_op.get('product_id') if batch_doc_op else None
            op_template_path, op_is_custom = get_op_template_path(product_id_for_op)
            fill_op_template(
                product_name=payload['product_name'],
                op_number=payload['op_number'],
                lote_number=payload['lote_number'],
                fab_date=payload['fab_date'],
                quantity_liters=payload['quantity_liters'],
                materials=payload['materials'],
                output_path=out_path,
                template_path=op_template_path,
                is_custom=op_is_custom,
            )
            mime_native = 'application/vnd.ms-excel'
            filename_native = f'OP_{safe_prod}_{safe_lote}.xls'

        if fmt == 'native':
            with open(out_path, 'rb') as f:
                content = f.read()
            return StreamingResponse(
                io.BytesIO(content),
                media_type=mime_native,
                headers={'Content-Disposition': f'attachment; filename="{filename_native}"'}
            )

        # Conversão para PDF via LibreOffice
        pdf_path = convert_to_pdf(out_path, tmpdir)
        if not pdf_path:
            raise HTTPException(status_code=500, detail='Falha ao converter para PDF (LibreOffice).')
        with open(pdf_path, 'rb') as f:
            content = f.read()
        pdf_filename = f'{("Ficha" if doc_type == "ficha" else "OP")}_{safe_prod}_{safe_lote}.pdf'
        return StreamingResponse(
            io.BytesIO(content),
            media_type='application/pdf',
            headers={'Content-Disposition': f'inline; filename="{pdf_filename}"'}
        )
    finally:
        # cleanup
        try:
            import shutil as _sh
            _sh.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass


# ----- Templates de Ficha por Produto -----

@api_router.get('/products/{product_id}/ficha-template')
async def get_product_ficha_template_status(
    product_id: str,
    current_user = Depends(get_current_user)
):
    """Retorna se o produto tem template personalizado e meta informações."""
    custom_path = os.path.join(CUSTOM_TEMPLATES_DIR, f'{product_id}.docx')
    exists = os.path.isfile(custom_path)
    if not exists:
        return {'has_custom': False}
    meta = await db.product_ficha_templates.find_one({'product_id': product_id}, {'_id': 0})
    return {
        'has_custom': True,
        'filename': (meta or {}).get('filename', ''),
        'uploaded_at': (meta or {}).get('uploaded_at', ''),
        'size': os.path.getsize(custom_path),
    }


@api_router.post('/products/{product_id}/ficha-template')
async def upload_product_ficha_template(
    product_id: str,
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    """Faz upload do template DOCX personalizado para um produto."""
    if not file.filename.lower().endswith('.docx'):
        raise HTTPException(status_code=400, detail='Apenas arquivos .docx são aceitos')
    product = await db.products.find_one({'id': product_id, 'deleted': False}, {'_id': 0})
    if not product:
        raise HTTPException(status_code=404, detail='Produto não encontrado')

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='Arquivo muito grande (limite 5MB)')

    try:
        from io import BytesIO
        from docx import Document as _Doc
        _Doc(BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail='Arquivo DOCX inválido ou corrompido')

    target = os.path.join(CUSTOM_TEMPLATES_DIR, f'{product_id}.docx')
    with open(target, 'wb') as f:
        f.write(content)

    await db.product_ficha_templates.update_one(
        {'product_id': product_id},
        {'$set': {
            'product_id': product_id,
            'filename': file.filename,
            'size': len(content),
            'uploaded_at': datetime.now(timezone.utc).isoformat(),
            'uploaded_by': current_user.get('email', ''),
        }},
        upsert=True
    )

    return {
        'message': 'Template enviado com sucesso',
        'filename': file.filename,
        'size': len(content),
    }


@api_router.delete('/products/{product_id}/ficha-template')
async def delete_product_ficha_template(
    product_id: str,
    current_user = Depends(get_current_user)
):
    """Remove o template personalizado de um produto (volta para o padrão)."""
    target = os.path.join(CUSTOM_TEMPLATES_DIR, f'{product_id}.docx')
    if os.path.isfile(target):
        os.remove(target)
    await db.product_ficha_templates.delete_one({'product_id': product_id})
    return {'message': 'Template removido — usando o padrão agora'}


# ----- Templates de OP por Produto -----

@api_router.get('/products/{product_id}/op-template')
async def get_product_op_template_status(
    product_id: str,
    current_user = Depends(get_current_user)
):
    """Retorna se o produto tem template de OP personalizado."""
    custom_path = os.path.join(CUSTOM_OP_TEMPLATES_DIR, f'{product_id}.xls')
    exists = os.path.isfile(custom_path)
    if not exists:
        return {'has_custom': False}
    meta = await db.product_op_templates.find_one({'product_id': product_id}, {'_id': 0})
    return {
        'has_custom': True,
        'filename': (meta or {}).get('filename', ''),
        'uploaded_at': (meta or {}).get('uploaded_at', ''),
        'size': os.path.getsize(custom_path),
    }


@api_router.post('/products/{product_id}/op-template')
async def upload_product_op_template(
    product_id: str,
    file: UploadFile = File(...),
    current_user = Depends(get_current_user)
):
    """
    Faz upload do template XLS personalizado da OP para um produto.
    Quando este template é usado, o sistema preserva % e QUANT(Kg) do template
    (porque cada produto tem sua fórmula) e apenas atualiza cabeçalho + lote
    e validade das matérias-primas pelo nome.
    """
    if not file.filename.lower().endswith('.xls'):
        raise HTTPException(status_code=400, detail='Apenas arquivos .xls são aceitos')
    product = await db.products.find_one({'id': product_id, 'deleted': False}, {'_id': 0})
    if not product:
        raise HTTPException(status_code=404, detail='Produto não encontrado')

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='Arquivo muito grande (limite 5MB)')

    try:
        from io import BytesIO
        xlrd.open_workbook(file_contents=content, formatting_info=True)
    except Exception:
        raise HTTPException(status_code=400, detail='Arquivo XLS inválido ou corrompido')

    target = os.path.join(CUSTOM_OP_TEMPLATES_DIR, f'{product_id}.xls')
    with open(target, 'wb') as f:
        f.write(content)

    await db.product_op_templates.update_one(
        {'product_id': product_id},
        {'$set': {
            'product_id': product_id,
            'filename': file.filename,
            'size': len(content),
            'uploaded_at': datetime.now(timezone.utc).isoformat(),
            'uploaded_by': current_user.get('email', ''),
        }},
        upsert=True
    )

    return {
        'message': 'Template de OP enviado com sucesso',
        'filename': file.filename,
        'size': len(content),
    }


@api_router.delete('/products/{product_id}/op-template')
async def delete_product_op_template(
    product_id: str,
    current_user = Depends(get_current_user)
):
    """Remove o template de OP personalizado e volta ao padrão."""
    target = os.path.join(CUSTOM_OP_TEMPLATES_DIR, f'{product_id}.xls')
    if os.path.isfile(target):
        os.remove(target)
    await db.product_op_templates.delete_one({'product_id': product_id})
    return {'message': 'Template de OP removido — usando o padrão agora'}


# ==========================================================================
# ========== MÓDULO PEDIDOS (Compras a Fornecedores) =======================
# Independente do módulo de vendas/produção. Acesso restrito.
# ==========================================================================
import urllib.request as _urllib_request

PEDIDOS_ALLOWED_EMAILS = ['leonicelaboratorio@lumix.com', 'laboratoriolumix@outlook.com']
LUMIX_LOGO_URL = 'https://customer-assets.emergentagent.com/job_prodman-lumix/artifacts/aod9p9yw_images.png'
_LUMIX_LOGO_PATH = '/tmp/lumix_logo.png'


def require_pedidos_access(current_user):
    email = (current_user.get('email') or '').lower()
    if email not in [e.lower() for e in PEDIDOS_ALLOWED_EMAILS]:
        raise HTTPException(status_code=403, detail='Acesso não autorizado ao módulo de Pedidos')


def _get_lumix_logo_path():
    if not os.path.isfile(_LUMIX_LOGO_PATH):
        try:
            _urllib_request.urlretrieve(LUMIX_LOGO_URL, _LUMIX_LOGO_PATH)
        except Exception:
            return None
    return _LUMIX_LOGO_PATH


class POItem(BaseModel):
    name: str
    unit: str = ''
    quantity: float
    raw_material_id: Optional[str] = None


class PurchaseOrderCreate(BaseModel):
    supplier_id: str = ''
    supplier_name: str
    items: List[POItem]
    unit: str = 'Kg'
    observations: str = ''


class PurchaseOrderStatusUpdate(BaseModel):
    status: str  # pendente, enviado, recebido


class SupplierCatalogItemCreate(BaseModel):
    name: str
    unit: str = ''


async def _next_order_number():
    last = await db.purchase_orders.find_one({}, sort=[('seq', -1)])
    seq = (last.get('seq', 0) + 1) if last else 1
    return seq, f'PED-{seq:04d}'


@api_router.get('/suppliers/{supplier_id}/catalog')
async def get_supplier_catalog(supplier_id: str, current_user=Depends(get_current_user)):
    require_pedidos_access(current_user)
    items = []
    rms = await db.raw_materials.find({'supplier_id': supplier_id, 'deleted': False}, {'_id': 0}).to_list(1000)
    for rm in rms:
        items.append({
            'id': f"rm-{rm['id']}",
            'name': rm['name'],
            'unit': rm.get('type', 'Kg'),
            'source': 'raw_material',
            'raw_material_id': rm['id'],
        })
    cats = await db.supplier_catalog_items.find({'supplier_id': supplier_id, 'deleted': {'$ne': True}}, {'_id': 0}).to_list(1000)
    for c in cats:
        items.append({
            'id': c['id'],
            'name': c['name'],
            'unit': c.get('unit', ''),
            'source': 'custom',
            'raw_material_id': None,
        })
    items.sort(key=lambda x: x['name'].lower())
    return items


@api_router.post('/suppliers/{supplier_id}/catalog')
async def add_supplier_catalog_item(supplier_id: str, data: SupplierCatalogItemCreate, current_user=Depends(get_current_user)):
    require_pedidos_access(current_user)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail='Nome do item é obrigatório')
    existing = await db.supplier_catalog_items.find_one({
        'supplier_id': supplier_id,
        'name': {'$regex': f'^{re.escape(name)}$', '$options': 'i'},
        'deleted': {'$ne': True},
    })
    if existing:
        return {'id': existing['id'], 'name': existing['name'], 'unit': existing.get('unit', ''), 'source': 'custom', 'raw_material_id': None}
    item_id = str(uuid.uuid4())
    doc = {'id': item_id, 'supplier_id': supplier_id, 'name': name, 'unit': data.unit, 'created_at': datetime.now(timezone.utc).isoformat(), 'deleted': False}
    await db.supplier_catalog_items.insert_one(doc)
    return {'id': item_id, 'name': name, 'unit': data.unit, 'source': 'custom', 'raw_material_id': None}


@api_router.delete('/suppliers/{supplier_id}/catalog/{item_id}')
async def delete_supplier_catalog_item(supplier_id: str, item_id: str, current_user=Depends(get_current_user)):
    require_pedidos_access(current_user)
    await db.supplier_catalog_items.update_one({'id': item_id, 'supplier_id': supplier_id}, {'$set': {'deleted': True}})
    return {'message': 'Item removido do catálogo'}


@api_router.get('/purchase-orders')
async def get_purchase_orders(current_user=Depends(get_current_user)):
    require_pedidos_access(current_user)
    orders = await db.purchase_orders.find({'deleted': {'$ne': True}}, {'_id': 0}).sort('seq', -1).to_list(2000)
    return orders


@api_router.post('/purchase-orders')
async def create_purchase_order(data: PurchaseOrderCreate, current_user=Depends(get_current_user)):
    require_pedidos_access(current_user)
    if not data.items:
        raise HTTPException(status_code=400, detail='Adicione ao menos um item ao pedido')

    # Salva itens avulsos (sem matéria-prima vinculada) no catálogo do fornecedor para reuso
    if data.supplier_id:
        for item in data.items:
            if not item.raw_material_id:
                name = item.name.strip()
                if not name:
                    continue
                existing = await db.supplier_catalog_items.find_one({
                    'supplier_id': data.supplier_id,
                    'name': {'$regex': f'^{re.escape(name)}$', '$options': 'i'},
                    'deleted': {'$ne': True},
                })
                if not existing:
                    await db.supplier_catalog_items.insert_one({
                        'id': str(uuid.uuid4()), 'supplier_id': data.supplier_id,
                        'name': name, 'unit': item.unit,
                        'created_at': datetime.now(timezone.utc).isoformat(), 'deleted': False,
                    })

    seq, order_number = await _next_order_number()
    order_id = str(uuid.uuid4())
    order_unit = data.unit or 'Kg'
    doc = {
        'id': order_id,
        'seq': seq,
        'order_number': order_number,
        'supplier_id': data.supplier_id,
        'supplier_name': data.supplier_name,
        'unit': order_unit,
        'items': [{**item.model_dump(), 'unit': order_unit} for item in data.items],
        'observations': data.observations,
        'status': 'pendente',
        'created_by': current_user.get('name') or current_user.get('email', ''),
        'created_by_email': current_user.get('email', ''),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'delivered_at': None,
        'deleted': False,
    }
    await db.purchase_orders.insert_one(doc)
    doc.pop('_id', None)
    return doc


@api_router.put('/purchase-orders/{order_id}/status')
async def update_purchase_order_status(order_id: str, data: PurchaseOrderStatusUpdate, current_user=Depends(get_current_user)):
    require_pedidos_access(current_user)
    if data.status not in ('pendente', 'enviado', 'recebido'):
        raise HTTPException(status_code=400, detail='Status inválido')
    update = {'status': data.status}
    update['delivered_at'] = datetime.now(timezone.utc).isoformat() if data.status == 'recebido' else None
    result = await db.purchase_orders.update_one({'id': order_id}, {'$set': update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Pedido não encontrado')
    order = await db.purchase_orders.find_one({'id': order_id}, {'_id': 0})
    return order


@api_router.delete('/purchase-orders/{order_id}')
async def delete_purchase_order(order_id: str, current_user=Depends(get_current_user)):
    require_pedidos_access(current_user)
    await db.purchase_orders.update_one({'id': order_id}, {'$set': {'deleted': True}})
    return {'message': 'Pedido excluído'}


@api_router.get('/purchase-orders/{order_id}/pdf')
async def purchase_order_pdf(order_id: str, current_user=Depends(get_current_user)):
    require_pedidos_access(current_user)
    order = await db.purchase_orders.find_one({'id': order_id}, {'_id': 0})
    if not order:
        raise HTTPException(status_code=404, detail='Pedido não encontrado')

    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=16 * mm, bottomMargin=16 * mm, leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()

    # Paleta Lumix — tons de verde suaves
    green = colors.HexColor('#0B8F5A')
    green_dark = colors.HexColor('#066A43')
    green_soft = colors.HexColor('#ECFAF3')
    ink = colors.HexColor('#14323D')
    grey = colors.HexColor('#64748B')
    line_grey = colors.HexColor('#E2E8F0')

    title_style = ParagraphStyle('t', parent=styles['Title'], textColor=green_dark, fontSize=20, spaceAfter=0, alignment=2)
    sub_style = ParagraphStyle('s', parent=styles['Normal'], fontSize=11, textColor=grey, alignment=2)
    label_style = ParagraphStyle('l', parent=styles['Normal'], fontSize=9.5, textColor=grey)
    value_style = ParagraphStyle('v', parent=styles['Normal'], fontSize=10.5, textColor=ink)
    cell_style = ParagraphStyle('c', parent=styles['Normal'], fontSize=10, textColor=ink)
    head_style = ParagraphStyle('h', parent=styles['Normal'], fontSize=10, textColor=colors.white)
    foot_style = ParagraphStyle('f', parent=styles['Normal'], fontSize=8, textColor=grey, alignment=1)

    elements = []
    logo_path = _get_lumix_logo_path()
    logo_cell = Paragraph('<b>LUMIX</b>', title_style)
    if logo_path:
        try:
            logo_cell = RLImage(logo_path, width=40 * mm, height=20 * mm, kind='proportional')
        except Exception:
            pass
    title_block = [Paragraph('PEDIDO DE COMPRA', title_style), Paragraph(order.get('order_number', ''), sub_style)]
    header_tbl = Table([[logo_cell, title_block]], colWidths=[85 * mm, 89 * mm])
    header_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 8))
    elements.append(Table([['']], colWidths=[174 * mm], style=TableStyle([('LINEBELOW', (0, 0), (-1, -1), 2, green)])))
    elements.append(Spacer(1, 12))

    created = order.get('created_at', '')
    try:
        created_fmt = datetime.fromisoformat(created).strftime('%d/%m/%Y %H:%M')
    except Exception:
        created_fmt = created
    status_map = {'pendente': 'Pendente', 'enviado': 'Enviado', 'recebido': 'Recebido'}
    status_lbl = status_map.get(order.get('status', 'pendente'), 'Pendente')

    info_rows = [
        [Paragraph('FORNECEDOR', label_style), Paragraph('DATA', label_style)],
        [Paragraph(f"<b>{order.get('supplier_name', '-')}</b>", value_style), Paragraph(created_fmt, value_style)],
        [Paragraph('RESPONSÁVEL', label_style), Paragraph('UNIDADE / STATUS', label_style)],
        [Paragraph(order.get('created_by', '-'), value_style),
         Paragraph(f"{order.get('unit', '-')} &nbsp;•&nbsp; {status_lbl}", value_style)],
    ]
    info_tbl = Table(info_rows, colWidths=[100 * mm, 74 * mm])
    info_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), green_soft),
        ('BOX', (0, 0), (-1, -1), 0.5, line_grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(info_tbl)
    elements.append(Spacer(1, 16))

    data_rows = [[Paragraph('<b>#</b>', head_style), Paragraph('<b>PRODUTO</b>', head_style),
                  Paragraph('<b>UNIDADE</b>', head_style), Paragraph('<b>QUANTIDADE</b>', head_style)]]
    for i, it in enumerate(order.get('items', []), 1):
        qty = it.get('quantity', 0)
        try:
            qty_str = str(int(qty)) if float(qty) == int(qty) else str(qty)
        except Exception:
            qty_str = str(qty)
        data_rows.append([Paragraph(str(i), cell_style), Paragraph(it.get('name', ''), cell_style),
                          Paragraph(it.get('unit', ''), cell_style), Paragraph(qty_str, cell_style)])
    items_tbl = Table(data_rows, colWidths=[12 * mm, 102 * mm, 30 * mm, 30 * mm], repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), green),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, line_grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, green_soft]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (2, 0), (3, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (1, 0), (1, -1), 8),
    ]))
    elements.append(items_tbl)
    elements.append(Spacer(1, 6))

    total_items = len(order.get('items', []))
    total_tbl = Table([[Paragraph(f"<b>Total de itens: {total_items}</b>", value_style)]], colWidths=[174 * mm])
    total_tbl.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('TEXTCOLOR', (0, 0), (-1, -1), green_dark),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(total_tbl)
    elements.append(Spacer(1, 16))

    if order.get('observations'):
        elements.append(Paragraph('<b>OBSERVAÇÕES</b>', label_style))
        elements.append(Spacer(1, 4))
        obs_tbl = Table([[Paragraph(order.get('observations', '').replace('\n', '<br/>'), cell_style)]], colWidths=[174 * mm])
        obs_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
            ('BOX', (0, 0), (-1, -1), 0.5, line_grey),
            ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(obs_tbl)

    elements.append(Spacer(1, 24))
    elements.append(Table([['']], colWidths=[174 * mm], style=TableStyle([('LINEBELOW', (0, 0), (-1, -1), 0.5, line_grey)])))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph('Documento gerado automaticamente pelo sistema Lumix — Gestão Inteligente de Produção', foot_style))

    doc.build(elements)
    buf.seek(0)
    filename = f"{order.get('order_number', 'pedido')}.pdf"
    return StreamingResponse(buf, media_type='application/pdf',
                             headers={'Content-Disposition': f'attachment; filename="{filename}"'})


# ========== NOTIFICAÇÕES + WEB PUSH ==========
from pywebpush import webpush, WebPushException

VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_SUB = os.environ.get('VAPID_SUB', 'mailto:admin@lumix.com')


class NotificationCreate(BaseModel):
    product_name: str
    message: str = ''


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict
    expirationTime: Optional[Any] = None


def _send_webpush(subscription, payload):
    webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={'sub': VAPID_SUB},
        ttl=86400,
    )


async def broadcast_push(title, body, url='/notificar'):
    if not VAPID_PRIVATE_KEY:
        return
    payload = {'title': title, 'body': body, 'url': url}
    subs = await db.push_subscriptions.find({}, {'_id': 0}).to_list(2000)
    for s in subs:
        try:
            await asyncio.to_thread(_send_webpush, s['subscription'], payload)
        except WebPushException as e:
            code = getattr(getattr(e, 'response', None), 'status_code', None)
            if code in (404, 410):
                await db.push_subscriptions.delete_one({'endpoint': s['endpoint']})
        except Exception:
            pass


@api_router.get('/push/vapid-public-key')
async def get_vapid_public_key():
    return {'publicKey': VAPID_PUBLIC_KEY}


@api_router.post('/push/subscribe')
async def push_subscribe(sub: PushSubscription, current_user=Depends(get_current_user)):
    doc = {
        'endpoint': sub.endpoint,
        'subscription': {'endpoint': sub.endpoint, 'keys': sub.keys},
        'email': current_user.get('email', ''),
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.push_subscriptions.update_one({'endpoint': sub.endpoint}, {'$set': doc}, upsert=True)
    return {'message': 'Inscrição registrada'}


@api_router.post('/push/unsubscribe')
async def push_unsubscribe(sub: PushSubscription, current_user=Depends(get_current_user)):
    await db.push_subscriptions.delete_one({'endpoint': sub.endpoint})
    return {'message': 'Inscrição removida'}


@api_router.get('/notifications')
async def get_notifications(current_user=Depends(get_current_user)):
    items = await db.notifications.find({'deleted': {'$ne': True}}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return items


@api_router.post('/notifications')
async def create_notification(data: NotificationCreate, background: BackgroundTasks, current_user=Depends(get_current_user)):
    name = data.product_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail='Selecione ou informe um produto')
    doc = {
        'id': str(uuid.uuid4()),
        'product_name': name,
        'message': data.message.strip(),
        'created_by': current_user.get('name') or current_user.get('email', ''),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False,
    }
    await db.notifications.insert_one(doc)
    doc.pop('_id', None)
    push_body = name + (f" — {doc['message']}" if doc['message'] else '')
    background.add_task(broadcast_push, 'Lumix — Novo aviso', push_body, '/notificar')
    return doc


@api_router.delete('/notifications/{notif_id}')
async def delete_notification(notif_id: str, current_user=Depends(get_current_user)):
    await db.notifications.update_one({'id': notif_id}, {'$set': {'deleted': True}})
    return {'message': 'Notificação removida'}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()