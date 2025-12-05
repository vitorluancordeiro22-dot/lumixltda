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
    created_at: str
    deleted: bool = False

class RawMaterialBatchCreate(BaseModel):
    raw_material_id: str
    date: str
    quantity: float

class RawMaterialBatchUpdate(BaseModel):
    batch_number: Optional[str] = None
    date: Optional[str] = None
    quantity: Optional[float] = None

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
    one_liter: int = 0
    two_liter: int = 0
    five_liter: int = 0
    total: float = 0.0
    operator: str
    created_at: str

class CountingCreate(BaseModel):
    one_liter: int = 0
    two_liter: int = 0
    five_liter: int = 0
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
    Gera número de lote no formato AAMMCCC onde:
    AA = 2 últimos dígitos do ano
    MM = mês com 2 dígitos  
    CCC = contador sequencial global (001, 002, 003...)
    
    O contador é compartilhado entre produtos e matérias-primas
    para garantir numeração única e sequencial.
    """
    date_obj = datetime.fromisoformat(date_str)
    yymm = date_obj.strftime('%y%m')  # AAMM
    
    # Buscar TODOS os lotes (produtos + matérias-primas) deste mês
    product_batches = await db.product_batches.find(
        {'batch_number': {'$regex': f'^{yymm}'}},
        {'_id': 0, 'batch_number': 1}
    ).to_list(1000)
    
    raw_material_batches = await db.raw_material_batches.find(
        {'batch_number': {'$regex': f'^{yymm}'}},
        {'_id': 0, 'batch_number': 1}
    ).to_list(1000)
    
    # Combinar todos os lotes
    all_batches = product_batches + raw_material_batches
    
    if not all_batches:
        counter = 1
    else:
        # Extrair todos os contadores e pegar o maior
        counters = [
            int(b['batch_number'][-3:]) 
            for b in all_batches 
            if len(b['batch_number']) >= 7 and b['batch_number'][-3:].isdigit()
        ]
        counter = max(counters) + 1 if counters else 1
    
    # Formato: AAMMCCC (ex: 2512001 = Dezembro/2025, lote 001)
    return f"{yymm}{counter:03d}"

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
        'deleted': False
    }
    await db.product_batches.insert_one(batch_doc)
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
    batch_number = await generate_batch_number(data.date)
    
    batch_doc = {
        'id': batch_id,
        'raw_material_id': data.raw_material_id,
        'batch_number': batch_number,
        'date': data.date,
        'quantity': data.quantity,
        'status': 'em_aberto',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'deleted': False
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
    
    # Calculate total
    total = (data.one_liter * 1) + (data.two_liter * 2) + (data.five_liter * 5)
    
    count_doc = {
        'id': str(uuid.uuid4()),
        'product_batch_id': batch_id,
        'one_liter': data.one_liter,
        'two_liter': data.two_liter,
        'five_liter': data.five_liter,
        'total': float(total),
        'operator': data.operator,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await db.counting.insert_one(count_doc)
    
    # Update batch total
    batch = await db.product_batches.find_one({'id': batch_id}, {'_id': 0})
    if batch:
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
    Retorna o histórico de envasamento de um funcionário.
    Inclui todas as contagens onde ele foi o operador.
    """
    member = await db.team.find_one({'id': member_id}, {'_id': 0})
    if not member:
        raise HTTPException(status_code=404, detail='Team member not found')
    
    # Buscar todas as contagens deste operador
    countings = await db.counting.find(
        {'operator': member['name']},
        {'_id': 0}
    ).sort('created_at', -1).to_list(1000)
    
    # Buscar informações dos lotes relacionados
    batch_ids = [c['product_batch_id'] for c in countings]
    batches = await db.product_batches.find(
        {'id': {'$in': batch_ids}},
        {'_id': 0}
    ).to_list(1000)
    
    # Mapear batches
    batch_map = {b['id']: b for b in batches}
    
    # Buscar produtos
    product_ids = [b['product_id'] for b in batches]
    products = await db.products.find(
        {'id': {'$in': product_ids}},
        {'_id': 0}
    ).to_list(1000)
    
    product_map = {p['id']: p for p in products}
    
    # Montar histórico
    history = []
    total_liters = 0
    
    for counting in countings:
        batch = batch_map.get(counting['product_batch_id'])
        if batch:
            product = product_map.get(batch['product_id'])
            history.append({
                'id': counting['id'],
                'date': counting['created_at'],
                'product_name': product['name'] if product else 'N/A',
                'batch_number': batch['batch_number'],
                'one_liter': counting['one_liter'],
                'two_liter': counting['two_liter'],
                'five_liter': counting['five_liter'],
                'total_liters': counting['total']
            })
            total_liters += counting['total']
    
    return {
        'member': member,
        'total_liters_bottled': total_liters,
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
    Arquiva automaticamente itens finalizados do mês anterior.
    Apenas move lotes com status 'finalizado' para o arquivo.
    """
    now = datetime.now(timezone.utc)
    
    # Mover lotes de produtos finalizados
    product_batches = await db.product_batches.find({
        'status': 'finalizado',
        'deleted': False
    }, {'_id': 0}).to_list(10000)
    
    archived_products = 0
    for batch in product_batches:
        # Verificar se é do mês anterior ou anterior
        batch_date = datetime.fromisoformat(batch['date'])
        if batch_date.year < now.year or (batch_date.year == now.year and batch_date.month < now.month):
            # Adicionar info de arquivo
            batch['archived_year'] = batch_date.year
            batch['archived_month'] = batch_date.month
            batch['archived_at'] = now.isoformat()
            
            await db.archived_product_batches.insert_one(batch)
            await db.product_batches.delete_one({'id': batch['id']})
            archived_products += 1
    
    # Mover lotes de matérias-primas finalizados
    rm_batches = await db.raw_material_batches.find({
        'status': 'finalizado',
        'deleted': False
    }, {'_id': 0}).to_list(10000)
    
    archived_materials = 0
    for batch in rm_batches:
        batch_date = datetime.fromisoformat(batch['date'])
        if batch_date.year < now.year or (batch_date.year == now.year and batch_date.month < now.month):
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

# ========== DASHBOARD ==========

@api_router.get('/dashboard/summary', response_model=DashboardSummary)
async def get_dashboard_summary(current_user = Depends(get_current_user)):
    open_batches = await db.product_batches.count_documents({'status': 'em_aberto', 'deleted': False})
    in_production = await db.production_orders.count_documents({'status': 'em_producao', 'deleted': False})
    
    # Calculate liters bottled this month
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    counts = await db.counting.find(
        {'created_at': {'$gte': month_start}},
        {'_id': 0, 'total': 1}
    ).to_list(10000)
    
    liters_month = sum(c.get('total', 0) for c in counts)
    
    return DashboardSummary(
        open_batches=open_batches,
        in_production_orders=in_production,
        liters_bottled_month=liters_month
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