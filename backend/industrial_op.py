"""
Sistema de Controle Industrial de Ordem de Produção (OP)
Módulo separado para funcionalidades de OP Industrial
"""

from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
from enum import Enum

# ========== ENUMS ==========

class OPStatus(str, Enum):
    AGUARDANDO_ENVASE = "aguardando_envase"
    EM_PRODUCAO = "em_producao"
    FINALIZADA = "finalizada"

class FileType(str, Enum):
    OP_MODEL = "op_model"
    FICHA_ANALISE = "ficha_analise"
    IMPRESSAO_MODEL = "impressao_model"

# ========== FILE MODELS ==========

class FileMetadata(BaseModel):
    """Metadata do arquivo armazenado no GridFS"""
    file_id: str  # GridFS file_id
    filename: str
    content_type: str
    size: int
    file_type: FileType
    version: int
    uploaded_at: str
    uploaded_by: str

class ProductFileModels(BaseModel):
    """Modelos de arquivos vinculados ao produto"""
    op_model: Optional[FileMetadata] = None
    ficha_analise: Optional[FileMetadata] = None
    impressao_model: Optional[FileMetadata] = None

# ========== INDUSTRIAL OP MODELS ==========

class RawMaterialUsage(BaseModel):
    """Matéria-prima utilizada na OP"""
    raw_material_id: str
    raw_material_name: str
    batch_id: str
    batch_number: str
    quantity_used: float
    unit: str
    selected_at: str

class OPHistoryEntry(BaseModel):
    """Entrada de histórico da OP"""
    timestamp: str
    user_id: str
    user_name: str
    action: str  # status_change, quantity_update, created, finalized
    previous_value: Optional[str] = None
    new_value: Optional[str] = None
    notes: Optional[str] = None

class IndustrialOP(BaseModel):
    """Ordem de Produção Industrial Completa"""
    id: str
    op_number: str  # Número sequencial da OP (ex: OP-2024-001)
    
    # Produto e Modelos
    product_id: str
    product_name: str
    product_code: str
    
    # Referência aos modelos (snapshot no momento da criação)
    op_model_snapshot: Optional[FileMetadata] = None
    ficha_analise_snapshot: Optional[FileMetadata] = None
    impressao_model_snapshot: Optional[FileMetadata] = None
    
    # Dados da Produção
    batch_number: str  # Lote do produto final
    planned_quantity: float
    produced_quantity: float = 0.0
    unit: str
    
    # Matérias-primas (auto-selecionadas - LIFO)
    raw_materials: List[RawMaterialUsage]
    
    # Datas e Status
    status: OPStatus
    created_at: str
    created_by: str
    created_by_name: str
    
    started_at: Optional[str] = None
    started_by: Optional[str] = None
    started_by_name: Optional[str] = None
    
    finalized_at: Optional[str] = None
    finalized_by: Optional[str] = None
    finalized_by_name: Optional[str] = None
    
    # Controle
    is_editable: bool = True
    is_printable: bool = False
    printed_at: Optional[str] = None
    printed_by: Optional[str] = None
    
    # Observações e notas
    observations: Optional[str] = None
    production_notes: Optional[str] = None
    
    # Histórico completo
    history: List[OPHistoryEntry] = []
    
    # Campos variáveis preenchidos pelo usuário
    responsible_name: str
    shift: Optional[str] = None
    equipment: Optional[str] = None
    temperature: Optional[float] = None
    custom_fields: Dict[str, str] = {}

class IndustrialOPCreate(BaseModel):
    """Dados para criar uma nova OP Industrial"""
    product_id: str
    planned_quantity: float
    unit: str
    responsible_name: str
    observations: Optional[str] = None
    shift: Optional[str] = None
    equipment: Optional[str] = None
    temperature: Optional[float] = None
    custom_fields: Dict[str, str] = {}

class IndustrialOPUpdate(BaseModel):
    """Atualizar dados variáveis da OP (antes de finalizar)"""
    produced_quantity: Optional[float] = None
    observations: Optional[str] = None
    production_notes: Optional[str] = None
    responsible_name: Optional[str] = None
    shift: Optional[str] = None
    equipment: Optional[str] = None
    temperature: Optional[float] = None
    custom_fields: Optional[Dict[str, str]] = None

class OPStatusChange(BaseModel):
    """Mudança de status da OP"""
    new_status: OPStatus
    notes: Optional[str] = None

# ========== PRODUCT UPDATE MODEL ==========

class ProductWithFiles(BaseModel):
    """Produto com arquivos modelo anexados"""
    id: str
    name: str
    code: Optional[str] = None
    category: Optional[str] = None
    unit: str
    expected_liters: float
    recipes: List
    file_models: Optional[ProductFileModels] = None
    created_at: str
    deleted: bool = False
