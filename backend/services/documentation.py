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
):
    """
    Preenche o DOCX da Ficha de Fabricação. Apenas substitui os campos variáveis
    no cabeçalho (PRODUTO, LOTE Nº, ORDEM DE PRODUÇÃO Nº, DATA) mantendo o restante
    do template (processo de fabricação, especificações) exatamente como está.
    """
    doc = Document(FICHA_TEMPLATE)

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
):
    """
    Preenche o XLS da Ordem de Produção mantendo TODA a formatação do template:
    bordas, alinhamento, fontes, tamanho.

    materials: lista de dicts no formato:
        {
            "name": "CONSERVANTE RN-BIO",
            "lote": "2605075",
            "validade": "DD/MM/AAAA" ou número serial ou string,
            "percent": 0.2,
            "quantity_kg": 2.0
        }

    A tabela começa na linha 5 (rowidx do xlrd) — mantém código e formatação.
    """
    rb = xlrd.open_workbook(OP_TEMPLATE, formatting_info=True)
    wb = xl_copy(rb)
    ws = wb.get_sheet(0)
    rs = rb.sheet_by_index(0)

    # --- Cabeçalho ---
    # Helper: escreve preservando o estilo (xlrd-xf-index) da célula
    def write_keep_style(row, col, value):
        xf_idx = rs.cell_xf_index(row, col)
        # xlutils mantém os xf indices, usamos diretamente
        ws.write(row, col, value, _xf(rb, xf_idx))

    def _xf(rb_local, xf_idx):
        # Reutiliza o estilo do template — xlutils.copy preserva mas precisamos
        # de um xlwt.XFStyle. Retornamos um Style ligado ao xf_idx do template.
        from xlwt.Style import XFStyle
        style = XFStyle()
        style._xf_index = xf_idx
        return style

    # [0,5] = 'OP Nº: 02'
    write_keep_style(0, 5, f'OP Nº: {op_number}')
    # [2,0] = 'PRODUTO: ...'
    write_keep_style(2, 0, f'PRODUTO: {product_name}')
    # [2,8] = quantidade em litros
    write_keep_style(2, 8, float(quantity_liters or 0))
    # [3,0] = 'LOTE: ...'
    write_keep_style(3, 0, f'LOTE: {lote_number}')
    # [3,2] = 'DATA: ...'
    write_keep_style(3, 2, f'DATA: {fab_date}')

    # --- Tabela de matérias-primas ---
    # Linhas 5..(5+N-1) do template original são preenchidas com MPs do CITRONELA.
    # Limpamos essas linhas (mantendo as bordas) e gravamos as MPs reais.
    table_start = 5
    table_end = 16  # última linha de MP no template (ÁGUA), inclusive
    cols_to_clear = [1, 2, 3, 4, 5]  # nome, lote, validade, %, qty

    # Apaga os valores antigos (mantém estilo das células)
    for r in range(table_start, table_end + 1):
        for c in cols_to_clear:
            try:
                xf_idx = rs.cell_xf_index(r, c)
                ws.write(r, c, '', _xf(rb, xf_idx))
            except Exception:
                pass

    # Escreve as MPs reais começando na linha 5
    total_pct = 0.0
    total_qty = 0.0
    for i, mat in enumerate(materials):
        row = table_start + i
        if row > table_end:
            break  # respeita as 12 linhas do template
        write_keep_style(row, 1, mat.get('name', ''))
        write_keep_style(row, 2, mat.get('lote', '') or '')
        write_keep_style(row, 3, mat.get('validade', '') or '')
        pct = mat.get('percent') or 0
        qty = mat.get('quantity_kg') or 0
        if pct:
            write_keep_style(row, 4, float(pct))
            total_pct += float(pct)
        if qty:
            write_keep_style(row, 5, float(qty))
            total_qty += float(qty)

    # Linha total (linha 17 no template tinha 100 / 1000 — preserva)
    # Se o usuário tiver poucos materiais, o total já cobre o que foi escrito.

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
