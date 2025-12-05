"""
Rotas e Endpoints para Sistema de OP Industrial
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from datetime import datetime, timezone
from uuid import uuid4
from typing import List
import io
from bson import ObjectId

from industrial_op import (
    OPStatus, FileType, FileMetadata, ProductFileModels,
    RawMaterialUsage, OPHistoryEntry, IndustrialOP,
    IndustrialOPCreate, IndustrialOPUpdate, OPStatusChange
)

# ========== HELPER FUNCTIONS ==========

async def upload_file_to_gridfs(fs, file: UploadFile, file_type: FileType, user_id: str, version: int = 1):
    """Upload arquivo para GridFS e retorna metadata"""
    file_content = await file.read()
    
    file_id = await fs.upload_from_stream(
        file.filename,
        io.BytesIO(file_content),
        metadata={
            "content_type": file.content_type,
            "file_type": file_type.value,
            "uploaded_by": user_id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "version": version
        }
    )
    
    return FileMetadata(
        file_id=str(file_id),
        filename=file.filename,
        content_type=file.content_type,
        size=len(file_content),
        file_type=file_type,
        version=version,
        uploaded_at=datetime.now(timezone.utc).isoformat(),
        uploaded_by=user_id
    )

async def get_file_from_gridfs(fs, file_id: str):
    """Baixar arquivo do GridFS"""
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        content = await grid_out.read()
        return content, grid_out.metadata
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Arquivo não encontrado: {str(e)}")

async def get_latest_raw_material_batches_with_stock(db, raw_material_id: str):
    """
    Retorna os lotes mais recentes COM ESTOQUE de uma matéria-prima (LIFO)
    """
    batches = await db.raw_material_batches.find({
        'raw_material_id': raw_material_id,
        'deleted': False,
        'quantity': {'$gt': 0}  # Apenas com estoque
    }, {'_id': 0}).to_list(1000)
    
    # Ordenar por data de recebimento (mais recente primeiro - LIFO)
    batches.sort(key=lambda x: x.get('date', ''), reverse=True)
    
    return batches

async def generate_op_number(db):
    """Gera número sequencial da OP"""
    now = datetime.now(timezone.utc)
    year = now.year
    prefix = f"OP-{year}-"
    
    # Buscar última OP do ano
    last_op = await db.industrial_ops.find_one(
        {'op_number': {'$regex': f'^{prefix}'}},
        sort=[('op_number', -1)]
    )
    
    if last_op:
        last_number = int(last_op['op_number'].split('-')[-1])
        new_number = last_number + 1
    else:
        new_number = 1
    
    return f"{prefix}{new_number:04d}"

# ========== ROUTES ==========

def setup_industrial_op_routes(api_router: APIRouter, db, fs, get_current_user):
    """Configura todas as rotas de OP Industrial"""
    
    # ========== UPLOAD DE ARQUIVOS MODELO ==========
    
    @api_router.post('/products/{product_id}/upload-model')
    async def upload_product_model(
        product_id: str,
        file_type: FileType,
        file: UploadFile = File(...),
        current_user = Depends(get_current_user)
    ):
        """Upload de arquivo modelo para um produto"""
        
        # Verificar se produto existe
        product = await db.products.find_one({'id': product_id, 'deleted': False}, {'_id': 0})
        if not product:
            raise HTTPException(status_code=404, detail='Produto não encontrado')
        
        # Verificar extensão do arquivo
        allowed_extensions = {'.docx', '.xlsx', '.xls', '.pdf'}
        file_extension = file.filename[file.filename.rfind('.'):].lower()
        if file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f'Formato não permitido. Use: {", ".join(allowed_extensions)}'
            )
        
        # Determinar versão (incrementa se já existe)
        file_models = product.get('file_models', {})
        current_file = file_models.get(file_type.value)
        version = (current_file['version'] + 1) if current_file else 1
        
        # Upload para GridFS
        metadata = await upload_file_to_gridfs(fs, file, file_type, current_user['id'], version)
        
        # Atualizar produto
        update_field = f'file_models.{file_type.value}'
        await db.products.update_one(
            {'id': product_id},
            {'$set': {update_field: metadata.dict()}}
        )
        
        return {
            'message': 'Arquivo enviado com sucesso',
            'file_metadata': metadata.dict()
        }
    
    @api_router.get('/products/{product_id}/download-model/{file_type}')
    async def download_product_model(
        product_id: str,
        file_type: FileType,
        current_user = Depends(get_current_user)
    ):
        """Download de arquivo modelo de um produto"""
        
        product = await db.products.find_one({'id': product_id, 'deleted': False}, {'_id': 0})
        if not product:
            raise HTTPException(status_code=404, detail='Produto não encontrado')
        
        file_models = product.get('file_models', {})
        file_metadata = file_models.get(file_type.value)
        
        if not file_metadata:
            raise HTTPException(status_code=404, detail='Arquivo modelo não encontrado')
        
        # Download do GridFS
        content, metadata = await get_file_from_gridfs(fs, file_metadata['file_id'])
        
        return StreamingResponse(
            io.BytesIO(content),
            media_type=file_metadata['content_type'],
            headers={
                'Content-Disposition': f'attachment; filename="{file_metadata["filename"]}"'
            }
        )
    
    # ========== CRUD DE ORDENS DE PRODUÇÃO ==========
    
    @api_router.post('/industrial-ops', response_model=IndustrialOP)
    async def create_industrial_op(
        op_data: IndustrialOPCreate,
        current_user = Depends(get_current_user)
    ):
        """Criar nova Ordem de Produção Industrial"""
        
        # Buscar produto
        product = await db.products.find_one(
            {'id': op_data.product_id, 'deleted': False},
            {'_id': 0}
        )
        if not product:
            raise HTTPException(status_code=404, detail='Produto não encontrado')
        
        # Verificar se produto tem modelo de OP
        file_models = product.get('file_models', {})
        if not file_models.get('op_model'):
            raise HTTPException(
                status_code=400,
                detail='Produto não possui modelo de OP cadastrado'
            )
        
        # Gerar número da OP
        op_number = await generate_op_number(db)
        
        # Gerar lote do produto (usar sistema existente)
        from datetime import datetime
        now = datetime.now(timezone.utc)
        date_str = now.strftime('%Y-%m-%d')
        batch_response = await generate_batch_number(date_str)
        batch_number = batch_response['batch_number']
        
        # Auto-selecionar matérias-primas (LIFO - mais recentes com estoque)
        raw_materials_usage = []
        recipes = product.get('recipes', [])
        
        if not recipes:
            raise HTTPException(
                status_code=400,
                detail='Produto não possui receita cadastrada'
            )
        
        for recipe in recipes:
            rm_id = recipe['raw_material_id']
            quantity_per_unit = recipe['quantity_per_liter']
            unit = recipe.get('unit', 'L')
            
            # Buscar matéria-prima
            rm = await db.raw_materials.find_one(
                {'id': rm_id, 'deleted': False},
                {'_id': 0}
            )
            if not rm:
                continue
            
            # Buscar lotes com estoque (LIFO)
            batches = await get_latest_raw_material_batches_with_stock(db, rm_id)
            
            if not batches:
                raise HTTPException(
                    status_code=400,
                    detail=f'Matéria-prima {rm["name"]} sem estoque disponível'
                )
            
            # Usar o lote mais recente (primeiro da lista LIFO)
            latest_batch = batches[0]
            quantity_needed = quantity_per_unit * op_data.planned_quantity
            
            raw_materials_usage.append(RawMaterialUsage(
                raw_material_id=rm_id,
                raw_material_name=rm['name'],
                batch_id=latest_batch['id'],
                batch_number=latest_batch['batch_number'],
                quantity_used=quantity_needed,
                unit=unit,
                selected_at=now.isoformat()
            ))
        
        # Criar snapshot dos modelos (versionamento)
        op_model_snapshot = file_models.get('op_model')
        ficha_analise_snapshot = file_models.get('ficha_analise')
        impressao_model_snapshot = file_models.get('impressao_model')
        
        # Criar histórico inicial
        history = [
            OPHistoryEntry(
                timestamp=now.isoformat(),
                user_id=current_user['id'],
                user_name=current_user['name'],
                action='created',
                new_value='aguardando_envase',
                notes='OP criada'
            )
        ]
        
        # Criar OP
        op = IndustrialOP(
            id=str(uuid4()),
            op_number=op_number,
            product_id=product['id'],
            product_name=product['name'],
            product_code=product.get('code', ''),
            op_model_snapshot=op_model_snapshot,
            ficha_analise_snapshot=ficha_analise_snapshot,
            impressao_model_snapshot=impressao_model_snapshot,
            batch_number=batch_number,
            planned_quantity=op_data.planned_quantity,
            produced_quantity=0.0,
            unit=op_data.unit,
            raw_materials=[rm.dict() for rm in raw_materials_usage],
            status=OPStatus.AGUARDANDO_ENVASE,
            created_at=now.isoformat(),
            created_by=current_user['id'],
            created_by_name=current_user['name'],
            is_editable=True,
            is_printable=False,
            observations=op_data.observations,
            responsible_name=op_data.responsible_name,
            shift=op_data.shift,
            equipment=op_data.equipment,
            temperature=op_data.temperature,
            custom_fields=op_data.custom_fields,
            history=[h.dict() for h in history]
        )
        
        # Salvar no banco
        await db.industrial_ops.insert_one(op.dict())
        
        return op
    
    @api_router.get('/industrial-ops', response_model=List[IndustrialOP])
    async def list_industrial_ops(
        status: Optional[OPStatus] = None,
        product_id: Optional[str] = None,
        current_user = Depends(get_current_user)
    ):
        """Listar Ordens de Produção"""
        
        filter_query = {}
        if status:
            filter_query['status'] = status.value
        if product_id:
            filter_query['product_id'] = product_id
        
        ops = await db.industrial_ops.find(
            filter_query,
            {'_id': 0}
        ).sort('created_at', -1).to_list(1000)
        
        return ops
    
    @api_router.get('/industrial-ops/{op_id}', response_model=IndustrialOP)
    async def get_industrial_op(
        op_id: str,
        current_user = Depends(get_current_user)
    ):
        """Buscar OP por ID"""
        
        op = await db.industrial_ops.find_one({'id': op_id}, {'_id': 0})
        if not op:
            raise HTTPException(status_code=404, detail='OP não encontrada')
        
        return op
    
    @api_router.put('/industrial-ops/{op_id}', response_model=IndustrialOP)
    async def update_industrial_op(
        op_id: str,
        update_data: IndustrialOPUpdate,
        current_user = Depends(get_current_user)
    ):
        """Atualizar dados da OP (apenas se editável)"""
        
        op = await db.industrial_ops.find_one({'id': op_id}, {'_id': 0})
        if not op:
            raise HTTPException(status_code=404, detail='OP não encontrada')
        
        if not op['is_editable']:
            raise HTTPException(
                status_code=400,
                detail='OP finalizada não pode ser editada'
            )
        
        # Preparar update
        update_fields = {}
        history_entries = []
        now = datetime.now(timezone.utc).isoformat()
        
        if update_data.produced_quantity is not None:
            old_value = op.get('produced_quantity', 0)
            update_fields['produced_quantity'] = update_data.produced_quantity
            history_entries.append({
                'timestamp': now,
                'user_id': current_user['id'],
                'user_name': current_user['name'],
                'action': 'quantity_update',
                'previous_value': str(old_value),
                'new_value': str(update_data.produced_quantity),
                'notes': 'Quantidade atualizada'
            })
        
        if update_data.observations is not None:
            update_fields['observations'] = update_data.observations
        
        if update_data.production_notes is not None:
            update_fields['production_notes'] = update_data.production_notes
        
        if update_data.responsible_name is not None:
            update_fields['responsible_name'] = update_data.responsible_name
        
        if update_data.shift is not None:
            update_fields['shift'] = update_data.shift
        
        if update_data.equipment is not None:
            update_fields['equipment'] = update_data.equipment
        
        if update_data.temperature is not None:
            update_fields['temperature'] = update_data.temperature
        
        if update_data.custom_fields is not None:
            update_fields['custom_fields'] = update_data.custom_fields
        
        # Atualizar histórico
        if history_entries:
            update_fields['$push'] = {'history': {'$each': history_entries}}
        
        # Salvar
        if update_fields:
            if '$push' in update_fields:
                push_data = update_fields.pop('$push')
                await db.industrial_ops.update_one(
                    {'id': op_id},
                    {'$set': update_fields, **push_data}
                )
            else:
                await db.industrial_ops.update_one(
                    {'id': op_id},
                    {'$set': update_fields}
                )
        
        # Retornar OP atualizada
        updated_op = await db.industrial_ops.find_one({'id': op_id}, {'_id': 0})
        return updated_op
    
    @api_router.post('/industrial-ops/{op_id}/change-status')
    async def change_op_status(
        op_id: str,
        status_change: OPStatusChange,
        current_user = Depends(get_current_user)
    ):
        """Mudar status da OP"""
        
        op = await db.industrial_ops.find_one({'id': op_id}, {'_id': 0})
        if not op:
            raise HTTPException(status_code=404, detail='OP não encontrada')
        
        now = datetime.now(timezone.utc).isoformat()
        update_fields = {'status': status_change.new_status.value}
        
        # Validações por status
        if status_change.new_status == OPStatus.EM_PRODUCAO:
            if op['status'] != OPStatus.AGUARDANDO_ENVASE.value:
                raise HTTPException(
                    status_code=400,
                    detail='Apenas OPs aguardando envase podem iniciar produção'
                )
            update_fields['started_at'] = now
            update_fields['started_by'] = current_user['id']
            update_fields['started_by_name'] = current_user['name']
        
        elif status_change.new_status == OPStatus.FINALIZADA:
            if op['status'] != OPStatus.EM_PRODUCAO.value:
                raise HTTPException(
                    status_code=400,
                    detail='Apenas OPs em produção podem ser finalizadas'
                )
            
            if op.get('produced_quantity', 0) <= 0:
                raise HTTPException(
                    status_code=400,
                    detail='Quantidade produzida deve ser maior que zero'
                )
            
            update_fields['finalized_at'] = now
            update_fields['finalized_by'] = current_user['id']
            update_fields['finalized_by_name'] = current_user['name']
            update_fields['is_editable'] = False
            update_fields['is_printable'] = True
        
        # Adicionar ao histórico
        history_entry = {
            'timestamp': now,
            'user_id': current_user['id'],
            'user_name': current_user['name'],
            'action': 'status_change',
            'previous_value': op['status'],
            'new_value': status_change.new_status.value,
            'notes': status_change.notes or f'Status alterado para {status_change.new_status.value}'
        }
        
        # Atualizar
        await db.industrial_ops.update_one(
            {'id': op_id},
            {
                '$set': update_fields,
                '$push': {'history': history_entry}
            }
        )
        
        return {'message': 'Status atualizado com sucesso'}
    
    @api_router.post('/industrial-ops/{op_id}/print')
    async def print_op_document(
        op_id: str,
        current_user = Depends(get_current_user)
    ):
        """Gerar PDF da OP para impressão"""
        
        op = await db.industrial_ops.find_one({'id': op_id}, {'_id': 0})
        if not op:
            raise HTTPException(status_code=404, detail='OP não encontrada')
        
        if not op['is_printable']:
            raise HTTPException(
                status_code=400,
                detail='OP deve ser finalizada antes de imprimir'
            )
        
        # Registrar impressão
        now = datetime.now(timezone.utc).isoformat()
        await db.industrial_ops.update_one(
            {'id': op_id},
            {
                '$set': {
                    'printed_at': now,
                    'printed_by': current_user['id']
                },
                '$push': {
                    'history': {
                        'timestamp': now,
                        'user_id': current_user['id'],
                        'user_name': current_user['name'],
                        'action': 'printed',
                        'notes': 'Documento impresso'
                    }
                }
            }
        )
        
        # TODO: Gerar PDF real baseado no modelo
        # Por enquanto, retornar dados em JSON que o frontend pode usar
        return {
            'message': 'PDF gerado com sucesso',
            'op_data': op,
            'generated_at': now
        }
    
    return api_router
