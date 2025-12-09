"""
Gerador de Documentos Preenchidos (FICHA e OP)
Sistema que preenche templates .docx e .xls/.xlsx com dados da produção
"""
from docx import Document
from openpyxl import load_workbook
from datetime import datetime
import io
import os
import tempfile
import subprocess
from typing import Dict, List, Any

def fill_docx_template(template_content: bytes, data: Dict[str, Any]) -> bytes:
    """
    Preenche template .docx com dados da produção
    
    Args:
        template_content: Conteúdo do arquivo .docx em bytes
        data: Dicionário com os dados para preencher os placeholders
        
    Returns:
        bytes: Arquivo .docx preenchido
    """
    # Carregar o template do buffer
    doc = Document(io.BytesIO(template_content))
    
    # Criar mapeamento de placeholders
    # Os placeholders podem estar em vários formatos: {{LOTE}}, {LOTE}, LOTE, etc.
    placeholders = {
        'LOTE': data.get('batch_number', ''),
        'PRODUTO': data.get('product_name', ''),
        'DATA': data.get('date', ''),
        'MATERIA_PRIMA': data.get('raw_materials_text', ''),
        'LOTE_MATERIA_PRIMA': data.get('raw_materials_batches', '')
    }
    
    # Substituir em parágrafos
    for paragraph in doc.paragraphs:
        for key, value in placeholders.items():
            # Suportar vários formatos de placeholder
            for pattern in [f'{{{{{key}}}}}', f'{{{key}}}', key]:
                if pattern in paragraph.text:
                    paragraph.text = paragraph.text.replace(pattern, str(value))
    
    # Substituir em tabelas
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    for key, value in placeholders.items():
                        for pattern in [f'{{{{{key}}}}}', f'{{{key}}}', key]:
                            if pattern in paragraph.text:
                                paragraph.text = paragraph.text.replace(pattern, str(value))
    
    # Salvar o documento preenchido em um buffer
    output_buffer = io.BytesIO()
    doc.save(output_buffer)
    output_buffer.seek(0)
    return output_buffer.getvalue()


def fill_excel_template(template_content: bytes, data: Dict[str, Any]) -> bytes:
    """
    Preenche template .xls/.xlsx com dados da produção
    
    Args:
        template_content: Conteúdo do arquivo Excel em bytes
        data: Dicionário com os dados para preencher os placeholders
        
    Returns:
        bytes: Arquivo Excel preenchido
    """
    # Salvar template temporariamente
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_input:
        temp_input.write(template_content)
        temp_input_path = temp_input.name
    
    try:
        # Carregar o workbook
        wb = load_workbook(temp_input_path)
        
        # Criar mapeamento de placeholders
        placeholders = {
            'LOTE': data.get('batch_number', ''),
            'PRODUTO': data.get('product_name', ''),
            'DATA': data.get('date', ''),
            'MATERIA_PRIMA': data.get('raw_materials_text', ''),
            'LOTE_MATERIA_PRIMA': data.get('raw_materials_batches', '')
        }
        
        # Iterar por todas as sheets
        for sheet in wb.worksheets:
            for row in sheet.iter_rows():
                for cell in row:
                    if cell.value and isinstance(cell.value, str):
                        for key, value in placeholders.items():
                            # Suportar vários formatos de placeholder
                            for pattern in [f'{{{{{key}}}}}', f'{{{key}}}', key]:
                                if pattern in cell.value:
                                    cell.value = cell.value.replace(pattern, str(value))
        
        # Salvar o workbook preenchido
        output_buffer = io.BytesIO()
        wb.save(output_buffer)
        output_buffer.seek(0)
        
        return output_buffer.getvalue()
    
    finally:
        # Limpar arquivo temporário
        if os.path.exists(temp_input_path):
            os.remove(temp_input_path)


def convert_docx_to_pdf(docx_content: bytes) -> bytes:
    """
    Converte arquivo .docx para PDF usando LibreOffice
    
    Args:
        docx_content: Conteúdo do arquivo .docx em bytes
        
    Returns:
        bytes: Arquivo PDF
    """
    # Criar arquivos temporários
    with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_docx:
        temp_docx.write(docx_content)
        temp_docx_path = temp_docx.name
    
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Converter usando LibreOffice (headless)
        subprocess.run([
            'libreoffice',
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', temp_dir,
            temp_docx_path
        ], check=True, capture_output=True, timeout=30)
        
        # Ler o PDF gerado
        pdf_filename = os.path.splitext(os.path.basename(temp_docx_path))[0] + '.pdf'
        pdf_path = os.path.join(temp_dir, pdf_filename)
        
        with open(pdf_path, 'rb') as pdf_file:
            pdf_content = pdf_file.read()
        
        return pdf_content
    
    finally:
        # Limpar arquivos temporários
        if os.path.exists(temp_docx_path):
            os.remove(temp_docx_path)
        if os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir)


def convert_excel_to_pdf(excel_content: bytes) -> bytes:
    """
    Converte arquivo Excel para PDF usando LibreOffice
    
    Args:
        excel_content: Conteúdo do arquivo Excel em bytes
        
    Returns:
        bytes: Arquivo PDF
    """
    # Criar arquivos temporários
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_excel:
        temp_excel.write(excel_content)
        temp_excel_path = temp_excel.name
    
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Converter usando LibreOffice (headless)
        subprocess.run([
            'libreoffice',
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', temp_dir,
            temp_excel_path
        ], check=True, capture_output=True, timeout=30)
        
        # Ler o PDF gerado
        pdf_filename = os.path.splitext(os.path.basename(temp_excel_path))[0] + '.pdf'
        pdf_path = os.path.join(temp_dir, pdf_filename)
        
        with open(pdf_path, 'rb') as pdf_file:
            pdf_content = pdf_file.read()
        
        return pdf_content
    
    finally:
        # Limpar arquivos temporários
        if os.path.exists(temp_excel_path):
            os.remove(temp_excel_path)
        if os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir)


async def generate_documents_from_templates(
    op_data: Dict[str, Any],
    product_data: Dict[str, Any],
    raw_materials_data: List[Dict[str, Any]],
    docx_template_content: bytes = None,
    excel_template_content: bytes = None
) -> Dict[str, bytes]:
    """
    Gera documentos PDF preenchidos a partir dos templates
    
    Args:
        op_data: Dados da Ordem de Produção
        product_data: Dados do produto
        raw_materials_data: Lista de matérias-primas
        docx_template_content: Conteúdo do template .docx (opcional)
        excel_template_content: Conteúdo do template Excel (opcional)
        
    Returns:
        Dict com os PDFs gerados: {'docx_pdf': bytes, 'excel_pdf': bytes}
    """
    # Preparar dados para substituição
    raw_materials_text = '\n'.join([
        f"{rm.get('name', '')} - {rm.get('quantity', '')} {rm.get('unit', '')}"
        for rm in raw_materials_data
    ])
    
    raw_materials_batches = '\n'.join([
        f"{rm.get('name', '')}: Lote {rm.get('batch_number', '')}"
        for rm in raw_materials_data
    ])
    
    data = {
        'batch_number': op_data.get('batch_number', ''),
        'product_name': product_data.get('name', ''),
        'date': op_data.get('date', datetime.now().strftime('%d/%m/%Y')),
        'raw_materials_text': raw_materials_text,
        'raw_materials_batches': raw_materials_batches
    }
    
    result = {}
    
    # Processar template .docx
    if docx_template_content:
        try:
            filled_docx = fill_docx_template(docx_template_content, data)
            result['docx_pdf'] = convert_docx_to_pdf(filled_docx)
        except Exception as e:
            raise Exception(f"Erro ao processar template .docx: {str(e)}")
    
    # Processar template Excel
    if excel_template_content:
        try:
            filled_excel = fill_excel_template(excel_template_content, data)
            result['excel_pdf'] = convert_excel_to_pdf(filled_excel)
        except Exception as e:
            raise Exception(f"Erro ao processar template Excel: {str(e)}")
    
    return result
