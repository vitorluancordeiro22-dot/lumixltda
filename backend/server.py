from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
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
import io
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
    id: str
    product_id: str
    batch_number: str
    date: str
    unit: str
    planned_liters: float
    status: str  # em_aberto, finalizado
    total_bottled: float = 0.0
    created_at: str
    deleted: bool = False

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
        'status': 'em_aberto',
        'total_bottled': 0.0,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False,
        'is_custom': bool(data.custom_batch_number)
    }
    await db.product_batches.insert_one(batch_doc)
    
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
    
    await db.trash.insert_one({
        'id': str(__import__('uuid').uuid4()),
        'item_type': 'product_batch',
        'item_data': batch,
        'deleted_at': datetime.now(timezone.utc).isoformat()
    })
    await db.product_batches.update_one({'id': batch_id}, {'$set': {'deleted': True}})
    return {'message': 'Batch moved to trash'}

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
    open_batches = await db.product_batches.count_documents({'status': 'em_aberto', 'deleted': False})
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
    Retorna dados de produção diária dos últimos 30 dias para o gráfico.
    """
    from collections import defaultdict
    
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    
    daily_totals = defaultdict(float)
    
    # Buscar contagens dos últimos 30 dias
    counts = await db.counting.find(
        {'created_at': {'$gte': thirty_days_ago}},
        {'_id': 0}
    ).to_list(10000)
    
    for c in counts:
        created_at = c.get('created_at', '')[:10]  # Pegar apenas a data YYYY-MM-DD
        half = c.get('half_liter', 0) or 0
        one = c.get('one_liter', 0) or 0
        two = c.get('two_liter', 0) or 0
        five = c.get('five_liter', 0) or 0
        total = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
        daily_totals[created_at] += total
    
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
    Retorna dados de produção mensal dos últimos 12 meses para o gráfico.
    Inclui contagens ativas e arquivadas.
    """
    from collections import defaultdict
    
    now = datetime.now(timezone.utc)
    current_year = now.year
    current_month = now.month
    
    monthly_totals = defaultdict(float)
    
    # Gerar os últimos 12 meses
    months_data = []
    for i in range(11, -1, -1):
        month = current_month - i
        year = current_year
        while month <= 0:
            month += 12
            year -= 1
        months_data.append({'year': year, 'month': month})
    
    # Buscar todas as contagens ativas
    all_counts = await db.counting.find({}, {'_id': 0}).to_list(50000)
    
    for c in all_counts:
        created_at = c.get('created_at', '')
        if not created_at:
            continue
        try:
            dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            key = f"{dt.year}-{dt.month:02d}"
            half = c.get('half_liter', 0) or 0
            one = c.get('one_liter', 0) or 0
            two = c.get('two_liter', 0) or 0
            five = c.get('five_liter', 0) or 0
            total = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
            monthly_totals[key] += total
        except:
            continue
    
    # Buscar contagens arquivadas
    archived_batches = await db.archived_product_batches.find({}, {'_id': 0}).to_list(10000)
    
    for batch in archived_batches:
        countings_history = batch.get('countings_history', [])
        archived_year = batch.get('archived_year')
        archived_month = batch.get('archived_month')
        
        if archived_year and archived_month:
            key = f"{archived_year}-{archived_month:02d}"
            for c in countings_history:
                half = c.get('half_liter', 0) or 0
                one = c.get('one_liter', 0) or 0
                two = c.get('two_liter', 0) or 0
                five = c.get('five_liter', 0) or 0
                total = (half * 0.5) + (one * 1) + (two * 2) + (five * 5)
                monthly_totals[key] += total
    
    # Formatar resultado
    month_names = {
        1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
        7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez'
    }
    
    result = []
    for m in months_data:
        key = f"{m['year']}-{m['month']:02d}"
        result.append({
            'month': f"{month_names[m['month']]}/{str(m['year'])[2:]}",
            'year': m['year'],
            'month_num': m['month'],
            'liters': round(monthly_totals.get(key, 0), 1)
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