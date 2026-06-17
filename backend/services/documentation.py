"""
Geração automática de documentação de produção (Ficha de Fabricação e Ordem de Produção)
usando os templates oficiais anexados pelo usuário.

Estratégia:
- DOCX (Ficha de Fabricação) → modificado com python-docx preservando formatação original.
- XLS (Ordem de Produção) → modificado com xlutils.copy preservando formatação original.
- Para PDF, converte o arquivo gerado via LibreOffice headless.
"""

import os
import re
import subprocess
import tempfile
import shutil
from datetime import datetime
from typing import List, Dict, Optional

from docx import Document
import xlrd
import xlwt
from xlutils.copy import copy as xl_copy


TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')
FICHA_TEMPLATE = os.path.join(TEMPLATES_DIR, 'ficha_template.docx')
OP_TEMPLATE = os.path.join(TEMPLATES_DIR, 'op_template.xls')
CUSTOM_TEMPLATES_DIR = os.path.join(TEMPLATES_DIR, 'custom_ficha')
CUSTOM_OP_TEMPLATES_DIR = os.path.join(TEMPLATES_DIR, 'custom_op')
os.makedirs(CUSTOM_TEMPLATES_DIR, exist_ok=True)
os.makedirs(CUSTOM_OP_TEMPLATES_DIR, exist_ok=True)


def get_ficha_template_path(product_id: Optional[str] = None) -> str:
    """Retorna template da Ficha (custom do produto se existir, senão padrão)."""
    if product_id:
        custom = os.path.join(CUSTOM_TEMPLATES_DIR, f'{product_id}.docx')
        if os.path.isfile(custom):
            return custom
    return FICHA_TEMPLATE


def get_op_template_path(product_id: Optional[str] = None) -> tuple:
    """
    Retorna (caminho do template XLS da OP, is_custom).
    is_custom=True quando o produto tem template próprio.
    """
    if product_id:
        custom = os.path.join(CUSTOM_OP_TEMPLATES_DIR, f'{product_id}.xls')
        if os.path.isfile(custom):
            return (custom, True)
    return (OP_TEMPLATE, False)


def _fmt_date_br(value) -> str:
    """Aceita 'YYYY-MM-DD', datetime ou ISO string e devolve 'DD/MM/AAAA'."""
    if not value:
        return ''
    s = str(value)
    s = s.split('T')[0]
    parts = s.split('-')
    if len(parts) == 3 and len(parts[0]) == 4:
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return s


def _replace_in_paragraph(paragraph, old: str, new: str):
    """
    Substitui texto em parágrafo preservando ao máximo a formatação dos runs.
    Quando o trecho está espalhado entre múltiplos runs, concatena no primeiro
    run que contenha parte do texto e zera os demais (mantém font/size do primeiro).
    """
    if old not in paragraph.text:
        return False
    full = paragraph.text
    new_full = full.replace(old, new)
    # Estratégia simples: mantém o primeiro run com seu estilo e coloca o texto inteiro nele,
    # zerando os demais. Funciona quando o parágrafo tem estilo único.
    if paragraph.runs:
        paragraph.runs[0].text = new_full
        for r in paragraph.runs[1:]:
            r.text = ''
    else:
        paragraph.text = new_full
    return True


def fill_ficha_template(
    product_name: str,
    op_number: str,
    lote_number: str,
    fab_date: str,
    output_path: str,
    template_path: Optional[str] = None,
):
    """
    Preenche o DOCX da Ficha de Fabricação. Apenas substitui os campos variáveis
    no cabeçalho (PRODUTO, LOTE Nº, ORDEM DE PRODUÇÃO Nº, DATA) mantendo o restante
    do template (processo de fabricação, especificações) exatamente como está.

    template_path: se fornecido, usa esse template específico em vez do padrão.
    """
    src = template_path or FICHA_TEMPLATE
    doc = Document(src)

    # As substituições são feitas via regex porque os textos podem ter espaços
    # múltiplos / quebras visuais. O template tem "PRODUTO: CITRONELA GEL" e
    # "ORDEM DE PRODUÇÃO Nº: 02   DATA: 05/06/2026" no mesmo parágrafo.
    replacements = [
        (re.compile(r'PRODUTO:\s*[^\n\r]*?(?=\s{2,}|$)'), f'PRODUTO: {product_name}'),
        (re.compile(r'LOTE Nº:\s*\S+'), f'LOTE Nº: {lote_number}'),
        (re.compile(r'ORDEM DE PRODUÇÃO Nº:\s*\S+'), f'ORDEM DE PRODUÇÃO Nº: {op_number}'),
        (re.compile(r'(?<!Nº:\s)DATA:\s*\d{2}/\d{2}/\d{4}'), f'DATA: {fab_date}'),
    ]

    for p in doc.paragraphs:
        if not p.text.strip():
            continue
        new_text = p.text
        for pattern, repl in replacements:
            new_text = pattern.sub(repl, new_text)
        if new_text != p.text:
            if p.runs:
                p.runs[0].text = new_text
                for r in p.runs[1:]:
                    r.text = ''
            else:
                p.text = new_text

    doc.save(output_path)
    return output_path


def fill_op_template(
    product_name: str,
    op_number: str,
    lote_number: str,
    fab_date: str,
    quantity_liters: float,
    materials: List[Dict],
    output_path: str,
    template_path: Optional[str] = None,
    is_custom: bool = False,
):
    """
    Preenche o XLS da Ordem de Produção mantendo TODA a formatação do template.

    Comportamento:
      - is_custom=False (template padrão): substitui nome/lote/validade/%/qty da tabela
        com os materiais da receita do sistema.
      - is_custom=True (template do produto): mantém nome/% /qty como o usuário deixou
        no template (porque cada produto tem sua fórmula). Substitui APENAS o cabeçalho
        + lote e validade de cada MP (procurando pelo nome).
    """
    src = template_path or OP_TEMPLATE
    rb = xlrd.open_workbook(src, formatting_info=True)
    wb = xl_copy(rb)
    ws = wb.get_sheet(0)
    rs = rb.sheet_by_index(0)

    def _xf(rb_local, xf_idx):
        from xlwt.Style import XFStyle
        style = XFStyle()
        style._xf_index = xf_idx
        return style

    def write_keep_style(row, col, value):
        try:
            xf_idx = rs.cell_xf_index(row, col)
            ws.write(row, col, value, _xf(rb, xf_idx))
        except Exception:
            ws.write(row, col, value)

    # --- Cabeçalho (igual em ambos os modos) ---
    write_keep_style(0, 5, f'OP Nº: {op_number}')
    write_keep_style(2, 0, f'PRODUTO: {product_name}')
    write_keep_style(2, 8, float(quantity_liters or 0))
    write_keep_style(3, 0, f'LOTE: {lote_number}')
    write_keep_style(3, 2, f'DATA: {fab_date}')

    table_start = 5
    table_end = 16

    # Mapa nome → (lote, validade) do sistema
    mp_by_name = {}
    for m in materials:
        key = str(m.get('name') or '').strip().upper()
        if key:
            mp_by_name[key] = m

    if is_custom:
        # MODO CUSTOM: apenas atualiza Lote e Validade de cada linha existente,
        # casando pelo nome da MP que o usuário deixou no template.
        for r in range(table_start, table_end + 1):
            try:
                name_cell = rs.cell_value(r, 1) or ''
            except Exception:
                continue
            name_key = str(name_cell).strip().upper()
            if not name_key:
                continue
            mp = mp_by_name.get(name_key)
            if mp:
                write_keep_style(r, 2, str(mp.get('lote') or ''))
                write_keep_style(r, 3, str(mp.get('validade') or ''))
    else:
        # MODO PADRÃO (template Lumix): limpa a tabela e popula com a receita.
        cols_to_clear = [1, 2, 3, 4, 5]
        for r in range(table_start, table_end + 1):
            for c in cols_to_clear:
                try:
                    xf_idx = rs.cell_xf_index(r, c)
                    ws.write(r, c, '', _xf(rb, xf_idx))
                except Exception:
                    pass

        for i, mat in enumerate(materials):
            row = table_start + i
            if row > table_end:
                break
            write_keep_style(row, 1, mat.get('name', ''))
            write_keep_style(row, 2, str(mat.get('lote') or ''))
            write_keep_style(row, 3, str(mat.get('validade') or ''))
            pct = mat.get('percent') or 0
            qty = mat.get('quantity_kg') or 0
            if pct:
                write_keep_style(row, 4, float(pct))
            if qty:
                write_keep_style(row, 5, float(qty))

    wb.save(output_path)
    return output_path


def convert_to_pdf(input_path: str, output_dir: str) -> Optional[str]:
    """
    Converte DOCX/XLS para PDF usando LibreOffice headless.
    Retorna o caminho do PDF gerado ou None em caso de erro.
    """
    try:
        # LibreOffice usa userprofile temporário para evitar conflitos com instâncias paralelas
        with tempfile.TemporaryDirectory() as profile_dir:
            user_profile = f'-env:UserInstallation=file://{profile_dir}'
            result = subprocess.run(
                ['libreoffice', '--headless', user_profile,
                 '--convert-to', 'pdf', '--outdir', output_dir, input_path],
                capture_output=True, timeout=60, text=True
            )
            if result.returncode != 0:
                return None
            base = os.path.splitext(os.path.basename(input_path))[0]
            pdf_path = os.path.join(output_dir, f'{base}.pdf')
            return pdf_path if os.path.exists(pdf_path) else None
    except Exception:
        return None
