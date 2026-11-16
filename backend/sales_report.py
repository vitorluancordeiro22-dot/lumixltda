"""Leitura do relatório de vendas (GigaMob, PDF) e sugestão de produto.

Só funções puras: nada aqui acessa o banco. O PDF é lido em memória e
descartado; valores/preços do relatório nunca saem deste módulo.
"""
from datetime import date
from decimal import Decimal, InvalidOperation
import difflib
import hashlib
import io
import json
import re
import unicodedata

from pypdf import PdfReader

MAX_PDF_BYTES = 10 * 1024 * 1024

_NUM = r'-?\d[\d.]*,\d{3}'
_MONEY = r'-?\d[\d.]*,\d{2}'
# Uma linha do relatório: código(13) descrição [*] unidade quantidade preço total.
# Tolera quebras de linha dentro da linha (o PDF às vezes separa as colunas).
ROW = re.compile(
    rf'(?<!\d)(\d{{13}})\s+((?:(?!\d{{13}}).)+?)\s+(?:\*\s+)?([A-Za-z]{{1,5}})\s+({_NUM})\s+{_MONEY}\s+{_MONEY}',
    re.S,
)
PERIOD = re.compile(r'Emiss[ãa]o:\s*(\d{2})/(\d{2})/(\d{4})\s+at[ée]\s+(\d{2})/(\d{2})/(\d{4})', re.I)
TOTAL = re.compile(rf'Total\s+geral:\s*({_MONEY})', re.I)
COMPANY = re.compile(r'Empresa:\s*([^\n\r]+)', re.I)


def parse_decimal(text):
    """'1.499,000' -> Decimal('1499.000')."""
    try:
        return Decimal(text.replace('.', '').replace(',', '.'))
    except InvalidOperation:
        raise ValueError(f'Número inválido no relatório: {text}')


def _iso(d, m, y):
    return date(int(y), int(m), int(d)).isoformat()


def parse_report(data: bytes):
    """Lê o PDF e devolve as linhas (sem nenhum valor em dinheiro).

    Retorna {'lines': [...], 'period': {'start','end'}|None, 'company', 'total_quantity',
             'sum_quantity', 'warnings': [...], 'complete': bool}
    Levanta ValueError com mensagem em português se não for um relatório legível.
    """
    if not data or len(data) > MAX_PDF_BYTES:
        raise ValueError('Arquivo vazio ou maior que 10 MB')
    start = data.find(b'%PDF-')
    if start < 0 or start > 4096:
        raise ValueError('Este arquivo não é um PDF')
    try:
        reader = PdfReader(io.BytesIO(data[start:]))
        text = '\n'.join((page.extract_text() or '') for page in reader.pages)
    except Exception:
        raise ValueError('Não foi possível ler o PDF')
    if 'Total geral' not in text and not ROW.search(text):
        raise ValueError('Este PDF não parece ser o relatório de vendas do GigaMob')

    merged, order = {}, []
    for code, description, unit, qty in ROW.findall(text):
        description = re.sub(r'\s+', ' ', description).strip()
        quantity = parse_decimal(qty)
        if code in merged:
            merged[code]['quantity'] += quantity
            continue
        merged[code] = {'code': code, 'name': description, 'unit': unit.lower(), 'quantity': quantity}
        order.append(code)
    if not merged:
        raise ValueError('Nenhuma linha de produto encontrada no PDF')

    lines = []
    for code in order:
        row = merged[code]
        quantity = row['quantity']
        row['quantity'] = int(quantity) if quantity == quantity.to_integral_value() else float(quantity)
        lines.append(row)

    warnings, period = [], None
    match = PERIOD.search(text)
    if match:
        try:
            period = {'start': _iso(*match.groups()[:3]), 'end': _iso(*match.groups()[3:])}
        except ValueError:
            warnings.append('Não consegui entender o período do relatório')
    else:
        warnings.append('O relatório não informa o período de emissão')

    sum_quantity = sum(Decimal(str(line['quantity'])) for line in lines)
    total_match = TOTAL.search(text)
    total_quantity, complete = None, True
    if total_match:
        total_quantity = parse_decimal(total_match.group(1))
        if total_quantity != sum_quantity:
            complete = False
            warnings.append(
                f'A soma das quantidades lidas ({sum_quantity:.0f}) não bate com o total do relatório '
                f'({total_quantity:.0f}). Alguma linha não foi lida; gere o PDF de novo')
    else:
        warnings.append('Não encontrei o "Total geral" no PDF. Confira se o relatório está completo')

    company = COMPANY.search(text)
    return {
        'lines': lines, 'period': period, 'company': company.group(1).strip() if company else '',
        'total_quantity': float(total_quantity) if total_quantity is not None else None,
        'sum_quantity': float(sum_quantity), 'warnings': warnings, 'complete': complete,
    }


def fingerprint(period, lines):
    """Identifica o relatório (período + códigos + quantidades) para barrar importação repetida."""
    payload = json.dumps([period or {}, sorted((l['code'], str(l['quantity'])) for l in lines)], sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def periods_overlap(a, b):
    if not a or not b:
        return False
    return a['start'] <= b['end'] and b['start'] <= a['end']


# ---------- sugestão de produto e tamanho pelo nome ----------

ABBREVIATIONS = {'LP': 'LIMPA PISO', 'ALC': 'ALCOOL', 'PF': 'PERFUMADO', 'SAB': 'SABAO', 'LIQ': 'LIQUIDO', 'DET': 'DETERGENTE'}
SIZE_PATTERN = re.compile(r'(\d+(?:[.,]\d+)?)\s*(ML|LTS?|LITROS?|L|KGS?|GRS?|G)\b')
LITER_UNITS = {'L', 'LT', 'LTS', 'LITRO', 'LITROS'}
GRAM_UNITS = {'G', 'GR', 'GRS'}


def strip_accents(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')


def _normalize(text):
    return re.sub(r'[^A-Z0-9., ]+', ' ', strip_accents(text or '').upper())


def size_of(description):
    """Tamanho (chave do Estoque) citado no nome, ex.: 'PINHO GEL 2L' -> 'two_liter'."""
    text = _normalize(description)
    found = None
    for match in SIZE_PATTERN.finditer(text):
        value = float(match.group(1).replace(',', '.'))
        unit = match.group(2)
        if unit == 'ML' and value == 500:
            found = 'half_liter'
        elif unit == 'ML' and value == 1000:
            found = 'one_liter'
        elif unit in LITER_UNITS and value in (1, 2, 5):
            found = {1: 'one_liter', 2: 'two_liter', 5: 'five_liter'}[int(value)]
        elif unit in ('KG', 'KGS') and value == 1:
            found = 'one_kg'
        elif unit in GRAM_UNITS and value in (330, 500):
            found = 'three_thirty_gram' if value == 330 else 'five_hundred_gram'
        elif unit in GRAM_UNITS and value == 1000:
            found = 'one_kg'
    if found is None and re.search(r'\bGALAO\b|\bGALON\b', text):
        found = 'five_liter'
    return found


def name_tokens(description):
    """Palavras do nome, sem o tamanho e com abreviações expandidas (LP -> LIMPA PISO)."""
    text = SIZE_PATTERN.sub(' ', _normalize(description))
    tokens = []
    for word in re.findall(r'[A-Z0-9]+', text):
        tokens.extend(ABBREVIATIONS.get(word, word).split())
    return tokens


def name_score(a_tokens, b_tokens):
    if not a_tokens or not b_tokens:
        return 0.0
    a, b = set(a_tokens), set(b_tokens)
    jaccard = len(a & b) / len(a | b)
    ratio = difflib.SequenceMatcher(None, ' '.join(a_tokens), ' '.join(b_tokens)).ratio()
    return round(0.6 * ratio + 0.4 * jaccard, 3)


def suggest_product(description, products, threshold=0.7):
    """Melhor produto do Lumix para a descrição do GigaMob.

    products: [{'id', 'name', 'kind'}]  (kind = 'L' ou 'Kg')
    Retorna {'product_id', 'size', 'score', 'exact'} ou None. O tamanho só é sugerido
    se for compatível com a unidade do produto.
    """
    tokens = name_tokens(description)
    best = None
    for product in products:
        score = name_score(tokens, name_tokens(product['name']))
        if score >= threshold and (best is None or score > best[0]):
            best = (score, product)
    if best is None:
        return None
    score, product = best
    size = size_of(description)
    if size is not None:
        kind = {'half_liter': 'L', 'one_liter': 'L', 'two_liter': 'L', 'five_liter': 'L',
                'three_thirty_gram': 'Kg', 'five_hundred_gram': 'Kg', 'one_kg': 'Kg'}[size]
        if kind != product.get('kind'):
            size = None
    return {'product_id': product['id'], 'size': size, 'score': score, 'exact': score >= 0.95 and size is not None}
