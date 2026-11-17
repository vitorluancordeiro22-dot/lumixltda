"""Depósito e baixa por relatório de vendas — testes offline.

PYTHONPATH=backend python -m unittest discover -s backend/unit_tests -v
Os PDFs aqui são sintéticos (nenhum relatório real entra no repositório).
"""
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sales_report import fingerprint, parse_report, periods_overlap, size_of, suggest_product
from test_finished_stock import build

LAB = {'id': 'lab', 'name': 'Lab', 'email': 'laboratoriolumix@outlook.com'}
PROD = {'id': 'op', 'name': 'Operador', 'email': 'producao@lumix.com'}
API = '/api/finished-stock'


def make_pdf(lines):
    esc = lambda t: t.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    stream = '\n'.join(f'BT /F1 9 Tf 30 {780 - 14 * i} Td ({esc(t)}) Tj ET' for i, t in enumerate(lines)).encode('cp1252')
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream',
            b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']
    out, offsets = bytearray(b'%PDF-1.4\n'), []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f'{i} 0 obj\n'.encode() + o + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objs) + 1}\n'.encode() + b'0000000000 65535 f \n' + ''.join(f'{o:010d} 00000 n \n' for o in offsets).encode()
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()
    return bytes(out)


def br(number, decimals):
    """1499 -> '1.499,000' (formato numérico brasileiro do relatório)."""
    return f'{number:,.{decimals}f}'.translate(str.maketrans(',.', '.,'))


def report(rows, start='16/11/2026', end='16/11/2026', total=None):
    """rows: [(codigo, descricao, unidade, quantidade)] -> bytes de um PDF no formato do GigaMob."""
    lines = ['Relatorio de Produtos Mais e Menos Vendidos', 'Codigo Descricao Grade Und. Qtd. Vr. unitario Vr. total']
    for code, name, unit, qty in rows:
        lines.append(f'{code:0>13} {name} * {unit} {br(qty, 3)} 9,99 99,99')
    soma = sum(r[3] for r in rows) if total is None else total
    lines += [f'Total geral: {br(soma, 2)} 1.000,00',
              'Empresa: 368 - LUMIX PRODUTOS DE LIMPEZA', f'Emissao: {start} ate {end}']
    return make_pdf(lines)


class ReportParsing(unittest.TestCase):
    ROWS = [(6, 'PINHO GEL 2L', 'und', 1499), (64, 'PINHO GEL 5L', 'und', 127), (1, 'LIMPADOR PERFUMADO 2L', 'l', 7214)]

    def test_reads_rows_period_and_total_without_prices(self):
        data = parse_report(report(self.ROWS))
        self.assertEqual([(l['code'], l['name'], l['unit'], l['quantity']) for l in data['lines']],
                         [('0000000000006', 'PINHO GEL 2L', 'und', 1499), ('0000000000064', 'PINHO GEL 5L', 'und', 127),
                          ('0000000000001', 'LIMPADOR PERFUMADO 2L', 'l', 7214)])
        self.assertEqual(data['period'], {'start': '2026-11-16', 'end': '2026-11-16'})
        self.assertTrue(data['complete'])
        self.assertTrue(all(set(l) == {'code', 'name', 'unit', 'quantity'} for l in data['lines']))

    def test_accepts_http_header_glued_before_pdf(self):
        data = parse_report(b'HTTP/1.0 200 OK\r\nContent-Type: application/pdf\r\n\r\n' + report(self.ROWS))
        self.assertEqual(len(data['lines']), 3)

    def test_total_mismatch_marks_report_incomplete(self):
        data = parse_report(report(self.ROWS, total=9999))
        self.assertFalse(data['complete'])
        self.assertIn('não bate', data['warnings'][0])

    def test_rejects_non_pdf_and_unrelated_pdf(self):
        for bad in (b'', b'texto qualquer', make_pdf(['Contrato de aluguel', 'nada de vendas aqui'])):
            with self.subTest(bad=bad[:12]), self.assertRaises(ValueError):
                parse_report(bad)

    def test_size_from_name(self):
        for text, size in [('PINHO GEL 2L', 'two_liter'), ('LP PINHO 5L', 'five_liter'), ('ALC. PF ALECRIM 500 ML', 'half_liter'),
                           ('VINAGRE 2 LITROS', 'two_liter'), ('SABAO EM BARRA 500 GR', 'five_hundred_gram'),
                           ('TIRA MANCHAS 330 GR', 'three_thirty_gram'), ('PERCARBONATO 1KG', 'one_kg'),
                           ('DETERGENTE GALÃO', 'five_liter'), ('RODO 40 CM', None), ('VASSOURA DE PELO', None)]:
            with self.subTest(text=text):
                self.assertEqual(size_of(text), size)

    def test_suggestion_matches_name_expands_abbreviations_and_checks_unit(self):
        products = [{'id': 'a', 'name': 'Pinho Gel', 'kind': 'L'}, {'id': 'b', 'name': 'Limpa Piso Pinho', 'kind': 'L'},
                    {'id': 'c', 'name': 'Sabão em Barra', 'kind': 'Kg'}]
        self.assertEqual(suggest_product('PINHO GEL 2L', products), {'product_id': 'a', 'size': 'two_liter', 'score': 1.0, 'exact': True})
        self.assertEqual(suggest_product('LP PINHO 5L', products)['product_id'], 'b')
        self.assertEqual(suggest_product('SABAO EM BARRA 500 GR', products)['size'], 'five_hundred_gram')
        self.assertIsNone(suggest_product('RODO 40 CM', products))
        wrong_unit = suggest_product('SABAO EM BARRA 2L', products)       # 2L num produto em Kg
        self.assertEqual((wrong_unit['product_id'], wrong_unit['size'], wrong_unit['exact']), ('c', None, False))

    def test_fingerprint_and_overlap(self):
        a, b = parse_report(report(self.ROWS)), parse_report(report(self.ROWS))
        self.assertEqual(fingerprint(a['period'], a['lines']), fingerprint(b['period'], b['lines']))
        c = parse_report(report(self.ROWS[:2]))
        self.assertNotEqual(fingerprint(a['period'], a['lines']), fingerprint(c['period'], c['lines']))
        self.assertTrue(periods_overlap({'start': '2026-11-01', 'end': '2026-11-30'}, {'start': '2026-11-16', 'end': '2026-11-16'}))
        self.assertFalse(periods_overlap({'start': '2026-11-15', 'end': '2026-11-15'}, {'start': '2026-11-16', 'end': '2026-11-16'}))


class DepositFlow(unittest.TestCase):
    def setUp(self):
        self.client, self.db, self.pushes = build(user=LAB)

    def entry(self, **kw):
        body = {'product_id': 'desinf', 'size': 'one_liter', 'quantity': 0, 'batch_id': 'b1', 'operator': 'Vitor', **kw}
        return self.client.post(f'{API}/entries', json=body)

    def exit(self, quantity, product='desinf', size='one_liter'):
        return self.client.post(f'{API}/exits', json={'items': [{'product_id': product, 'size': size, 'quantity': quantity}]})

    def row(self, product='desinf', size='one_liter'):
        data = self.client.get(f'{API}/deposit/overview').json()
        prod = next(p for p in data['products'] if p['product_id'] == product)
        return next((s for s in prod['sizes'] if s['size'] == size), None)

    def test_production_split_between_stock_and_deposit(self):
        # Vitor fez 80 garrafas: 35 ficam no Estoque, as outras 45 vão para o Depósito
        r = self.entry(quantity=35, to_deposit=45)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((r.json()['quantity'], r.json()['deposit']['quantity']), (35, 45))
        row = self.row()
        self.assertEqual((row['stock'], row['deposit'], row['total']), (35, 45, 80))
        self.assertEqual(row['lots'], [{'batch_id': 'b1', 'batch_number': '2611001', 'quantity': 45}])
        # o lote está esgotado para a Contagem: nada mais entra
        self.assertEqual(self.entry(quantity=1).status_code, 400)
        self.assertEqual(self.entry(to_deposit=1).status_code, 400)
        batches = self.client.get(f'{API}/products/desinf/batches').json()
        self.assertEqual(next(b for b in batches if b['batch_id'] == 'b1')['sizes']['one_liter']['available'], 0)

    def test_everything_can_go_straight_to_deposit(self):
        r = self.entry(quantity=0, to_deposit=80)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((r.json()['type'], r.json()['origin'], r.json()['quantity']), ('entrada', 'producao', 80))
        row = self.row()
        self.assertEqual((row['stock'], row['deposit']), (0, 80))

    def test_split_cannot_exceed_counting(self):
        r = self.entry(quantity=35, to_deposit=46)
        self.assertEqual(r.status_code, 400)
        self.assertIn('Disponível: 80', r.json()['detail'])
        self.assertEqual((self.row() or {}).get('total', 0), 0)
        self.assertEqual(self.entry(quantity=0, to_deposit=0).status_code, 400)

    def test_inventory_modes_keep_their_rules(self):
        self.assertEqual(self.entry(mode='inventario', batch_id=None, quantity=10, to_deposit=5).status_code, 400)
        self.assertEqual(self.entry(mode='inventario', batch_id=None, quantity=0).status_code, 400)

    def test_every_exit_from_stock_lands_in_deposit_with_same_lot(self):
        self.entry(quantity=80)
        self.assertEqual(self.exit(25).status_code, 200)
        row = self.row()
        self.assertEqual((row['stock'], row['deposit'], row['total']), (55, 25, 80))
        self.assertEqual(row['lots'][0]['batch_number'], '2611001')
        moves = self.client.get(f'{API}/deposit/movements').json()
        self.assertEqual((moves[0]['type'], moves[0]['origin'], moves[0]['quantity']), ('entrada', 'estoque', 25))

    def test_management_list_confirmation_also_feeds_deposit(self):
        self.entry(quantity=35)
        lst = self.client.post(f'{API}/lists', json={'items': [{'product_id': 'desinf', 'size': 'one_liter', 'quantity': 25}]}).json()
        self.assertEqual(self.row()['deposit'], 0)     # lista só criada: nada se mexe
        self.assertEqual(self.client.post(f"{API}/lists/{lst['id']}/confirm", json={}).status_code, 200)
        self.assertEqual((self.row()['stock'], self.row()['deposit']), (10, 25))

    def test_cancelling_a_stock_exit_takes_units_back_from_deposit(self):
        self.entry(quantity=80)
        out = self.exit(25).json()['movements'][0]
        self.assertEqual(self.client.post(f"{API}/movements/{out['id']}/cancel").status_code, 200)
        self.assertEqual((self.row()['stock'], self.row()['deposit']), (80, 0))

    def test_cancelling_exit_is_refused_when_units_already_left_deposit(self):
        self.entry(quantity=80)
        out = self.exit(25).json()['movements'][0]
        self.db.store.deposit_lots.update_one({'product_id': 'desinf', 'size': 'one_liter'}, {'$set': {'quantity': 5}})
        r = self.client.post(f"{API}/movements/{out['id']}/cancel")
        self.assertEqual(r.status_code, 400)
        self.assertIn('Depósito', r.json()['detail'])
        self.assertEqual(self.row()['stock'], 55)      # nada mudou

    def test_cancelling_a_split_entry_cascades_to_deposit(self):
        entry = self.entry(quantity=35, to_deposit=45).json()
        self.assertEqual(self.client.post(f"{API}/movements/{entry['id']}/cancel").status_code, 200)
        self.assertEqual((self.row()['stock'], self.row()['deposit']), (0, 0))
        self.assertEqual(self.entry(quantity=80).status_code, 200)    # devolveu o limite da Contagem

    def test_deposit_inventory_has_no_limit_and_can_be_undone(self):
        r = self.client.post(f'{API}/deposit/entries', json={'product_id': 'desinf', 'size': 'one_liter', 'quantity': 500})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['batch_number'], 'misturado')
        with_lot = self.client.post(f'{API}/deposit/entries', json={'product_id': 'desinf', 'size': 'one_liter', 'quantity': 900, 'batch_id': 'b0'})
        self.assertEqual(with_lot.status_code, 200)
        self.assertEqual(self.row()['deposit'], 1400)
        self.assertEqual(self.entry(quantity=80).status_code, 200)    # inventário não gasta o limite da Contagem
        self.assertEqual(self.client.post(f"{API}/deposit/movements/{r.json()['id']}/cancel").status_code, 200)
        self.assertEqual(self.row()['deposit'], 900)
        self.assertEqual(self.client.post(f"{API}/deposit/entries", json={'product_id': 'desinf', 'size': 'two_liter', 'quantity': 5}).status_code, 400)

    def test_entries_born_from_stock_exits_cannot_be_undone_from_deposit(self):
        self.entry(quantity=80)
        self.exit(10)
        move = self.client.get(f'{API}/deposit/movements').json()[0]
        r = self.client.post(f"{API}/deposit/movements/{move['id']}/cancel")
        self.assertEqual(r.status_code, 400)
        self.assertIn('Estoque', r.json()['detail'])

    def test_total_view_includes_sizes_that_only_exist_in_one_place(self):
        self.client.post(f'{API}/deposit/entries', json={'product_id': 'desinf', 'size': 'five_liter', 'quantity': 7})
        self.entry(size='five_liter', quantity=3)
        row = self.row(size='five_liter')
        self.assertEqual((row['stock'], row['deposit'], row['total']), (3, 7, 10))


class PendingBatches(unittest.TestCase):
    """Lotes aguardando destino: nada fica "sumido" quando ninguém registra o Estoque."""

    def setUp(self):
        self.client, self.db, self.pushes = build(user=LAB)

    def pending(self, since='2026-01-01'):
        r = self.client.get(f'{API}/pending-batches', params={'since': since})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def keys(self, rows=None):
        return sorted((r['batch_number'], r['size'], r['available']) for r in (self.pending() if rows is None else rows))

    def test_finished_batches_without_destination_are_listed(self):
        # fixture: lote ativo 2611001 (80 de 1L + 4 de 5L) e lote arquivado 2610050 (20 de 1L)
        self.assertEqual(self.keys(), [('2610050', 'one_liter', 20), ('2611001', 'five_liter', 4), ('2611001', 'one_liter', 80)])

    def test_whole_batch_to_deposit_with_nothing_left_in_stock(self):
        r = self.client.post(f'{API}/entries', json={'product_id': 'desinf', 'size': 'one_liter', 'quantity': 0,
                                                     'to_deposit': 80, 'batch_id': 'b1', 'operator': 'Felipe'})
        self.assertEqual(r.status_code, 200, r.text)
        data = self.client.get(f'{API}/deposit/overview').json()
        row = next(s for p in data['products'] if p['product_id'] == 'desinf' for s in p['sizes'] if s['size'] == 'one_liter')
        self.assertEqual((row['stock'], row['deposit'], row['total']), (0, 80, 80))
        self.assertNotIn(('2611001', 'one_liter', 80), self.keys())
        self.assertEqual(self.keys(), [('2610050', 'one_liter', 20), ('2611001', 'five_liter', 4)])

    def test_split_registration_shrinks_the_pending_amount(self):
        self.client.post(f'{API}/entries', json={'product_id': 'desinf', 'size': 'one_liter', 'quantity': 35, 'batch_id': 'b1'})
        self.assertIn(('2611001', 'one_liter', 45), self.keys())
        self.client.post(f'{API}/entries', json={'product_id': 'desinf', 'size': 'one_liter', 'quantity': 0, 'to_deposit': 45, 'batch_id': 'b1'})
        self.assertNotIn('one_liter', [k[1] for k in self.keys() if k[0] == '2611001'])

    def test_undoing_a_registration_brings_the_batch_back(self):
        entry = self.client.post(f'{API}/entries', json={'product_id': 'desinf', 'size': 'one_liter', 'quantity': 0,
                                                         'to_deposit': 80, 'batch_id': 'b1'}).json()
        self.assertEqual(self.client.post(f"{API}/deposit/movements/{entry['id']}/cancel").status_code, 200)
        self.assertIn(('2611001', 'one_liter', 80), self.keys())

    def test_batches_still_being_counted_are_not_listed(self):
        self.db.store.product_batches.update_one({'id': 'b1'}, {'$set': {'status': 'em_aberto'}})
        self.assertEqual(self.keys(), [('2610050', 'one_liter', 20)])

    def test_dismiss_removes_from_list_without_touching_balances(self):
        r = self.client.post(f'{API}/pending-batches/dismiss', json={'batch_id': 'b1', 'size': 'one_liter'})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn(('2611001', 'one_liter', 80), self.keys())
        data = self.client.get(f'{API}/deposit/overview').json()
        self.assertEqual([s for p in data['products'] if p['product_id'] == 'desinf' for s in p['sizes'] if s['total']], [])
        self.assertEqual(self.client.post(f'{API}/pending-batches/dismiss', json={'batch_id': 'b1', 'size': 'xx'}).status_code, 400)
        # o lote continua disponível na Entrada normal
        ok = self.client.post(f'{API}/entries', json={'product_id': 'desinf', 'size': 'one_liter', 'quantity': 10, 'batch_id': 'b1'})
        self.assertEqual(ok.status_code, 200)

    def test_default_window_is_recent_batches_only(self):
        self.assertEqual(self.pending(since='2999-01-01'), [])
        default = self.client.get(f'{API}/pending-batches').json()   # lotes de 2026 ficam fora da janela padrão no futuro
        self.assertIsInstance(default, list)


class SalesImport(unittest.TestCase):
    def setUp(self):
        self.client, self.db, self.pushes = build(user=LAB)
        self.db.store.products.insert_many([
            {'id': 'pinho', 'name': 'Pinho Gel', 'unit': 'Litros', 'deleted': False},
            {'id': 'amac', 'name': 'Amaciante Azul', 'unit': 'Litros', 'deleted': False}])
        self.add_deposit('pinho', 'two_liter', 100)

    def add_deposit(self, product, size, quantity):
        self.assertEqual(self.client.post(f'{API}/deposit/entries', json={'product_id': product, 'size': size, 'quantity': quantity}).status_code, 200)

    def deposit(self, product='pinho', size='two_liter'):
        data = self.client.get(f'{API}/deposit/overview').json()
        prod = next(p for p in data['products'] if p['product_id'] == product)
        return next(s for s in prod['sizes'] if s['size'] == size)['deposit']

    def upload(self, rows, **kw):
        return self.client.post(f'{API}/sales/parse', files={'file': ('r.pdf', report(rows, **kw), 'application/pdf')})

    def link(self, *items):
        r = self.client.put(f'{API}/sales/codes', json={'items': list(items)})
        self.assertEqual(r.status_code, 200, r.text)

    ROWS = [(6, 'PINHO GEL 2L', 'und', 60), (46, 'RODO 40 CM', 'und', 2), (170, 'AMACIANTE AZUL 5L', 'und', 4)]

    def link_all(self):
        self.link({'code': '0000000000006', 'action': 'map', 'product_id': 'pinho', 'size': 'two_liter'},
                  {'code': '0000000000046', 'action': 'ignore'},
                  {'code': '0000000000170', 'action': 'map', 'product_id': 'amac', 'size': 'five_liter'})

    def test_only_laboratorio_can_use_sales_endpoints(self):
        other, _, _ = build(user=PROD)
        for method, url in (('post', f'{API}/sales/parse'), ('get', f'{API}/sales/imports'), ('get', f'{API}/sales/codes')):
            r = getattr(other, method)(url)
            self.assertEqual(r.status_code, 403, url)
        # o Depósito em si é aberto a todos
        self.assertEqual(other.get(f'{API}/deposit/overview').status_code, 200)

    def test_missing_pypdf_does_not_break_the_server_and_gives_a_clear_error(self):
        backend = str(Path(__file__).resolve().parents[1])
        code = ("import sys; sys.modules['pypdf'] = None; sys.path.insert(0, %r); "
                "import sales_report, deposit_sales, finished_stock; print('sobe sem pypdf')" % backend)
        out = subprocess.run([sys.executable, '-I', '-c', code], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr[-400:])
        self.assertIn('sobe sem pypdf', out.stdout)
        with patch.dict(sys.modules, {'pypdf': None}):
            r = self.upload([(6, 'PINHO GEL 2L', 'und', 1)])
        self.assertEqual(r.status_code, 503)
        self.assertIn('pip install pypdf', r.json()['detail'])
        # o resto do Depósito continua funcionando sem pypdf
        self.assertEqual(self.client.get(f'{API}/deposit/overview').status_code, 200)

    def test_rejects_files_that_are_not_the_sales_report(self):
        r = self.client.post(f'{API}/sales/parse', files={'file': ('x.pdf', b'isto nao e pdf', 'application/pdf')})
        self.assertEqual(r.status_code, 400)

    def test_unknown_codes_are_asked_and_block_the_download(self):
        state = self.upload(self.ROWS).json()
        self.assertEqual((state['summary']['unmapped'], state['blocking']), (3, ['unmapped']))
        by_code = {l['code']: l for l in state['lines']}
        self.assertEqual(by_code['0000000000006']['suggestion']['product_id'], 'pinho')
        self.assertTrue(by_code['0000000000006']['suggestion']['exact'])
        self.assertIsNone(by_code['0000000000046']['suggestion'])
        r = self.client.post(f"{API}/sales/imports/{state['id']}/confirm", json={})
        self.assertEqual(r.status_code, 400)
        self.assertIn('sem produto ligado', r.json()['detail'])
        self.assertEqual(self.deposit(), 100)

    def test_register_codes_without_downloading_anything(self):
        state = self.upload(self.ROWS).json()
        self.link_all()
        self.assertEqual(self.client.delete(f"{API}/sales/imports/{state['id']}").status_code, 200)   # descarta o relatório
        self.assertEqual(self.deposit(), 100)
        self.assertEqual(len(self.client.get(f'{API}/sales/codes').json()), 3)
        # no dia seguinte as ligações já estão salvas
        again = self.upload(self.ROWS, start='17/11/2026', end='17/11/2026').json()
        self.assertEqual((again['summary']['unmapped'], again['blocking']), (0, []))

    def test_a_new_code_on_another_day_is_asked_again(self):
        self.link_all()
        state = self.upload(self.ROWS + [(999, 'LAVA ROUPAS COCO 2L', 'und', 3)], start='18/11/2026', end='18/11/2026').json()
        self.assertEqual([l['code'] for l in state['lines'] if l['status'] == 'unmapped'], ['0000000000999'])
        self.assertEqual(state['blocking'], ['unmapped'])

    def test_download_takes_only_from_deposit_and_records_shortage(self):
        self.link_all()
        state = self.upload(self.ROWS).json()
        plan = {(i['product_id'], i['size']): i for i in state['plan']}
        self.assertEqual((plan[('pinho', 'two_liter')]['deduct'], plan[('pinho', 'two_liter')]['shortage']), (60, 0))
        self.assertEqual((plan[('amac', 'five_liter')]['deduct'], plan[('amac', 'five_liter')]['shortage']), (0, 4))   # sem saldo
        r = self.client.post(f"{API}/sales/imports/{state['id']}/confirm", json={})
        self.assertEqual(r.status_code, 200, r.text)
        done = r.json()
        self.assertEqual((done['status'], done['summary']['units'], done['summary']['shortage_units']), ('baixado', 60, 4))
        self.assertEqual(self.deposit(), 40)
        moves = [m for m in self.client.get(f'{API}/deposit/movements').json() if m['origin'] == 'venda']
        self.assertEqual([(m['product_name'], m['quantity']) for m in moves], [('Pinho Gel', 60)])   # sem movimento zerado
        self.assertIn('16/11/2026', moves[0]['note'])
        history = self.client.get(f'{API}/sales/imports').json()
        self.assertEqual((history[0]['status'], history[0]['shortages'][0]['shortage']), ('baixado', 4))

    def test_stock_is_never_touched_by_sales(self):
        self.link_all()
        self.client.post(f'{API}/entries', json={'product_id': 'desinf', 'size': 'one_liter', 'quantity': 30, 'batch_id': 'b1'})
        state = self.upload(self.ROWS).json()
        self.client.post(f"{API}/sales/imports/{state['id']}/confirm", json={})
        stock = next(p for p in self.client.get(f'{API}/overview').json()['products'] if p['product_id'] == 'desinf')
        self.assertEqual(next(s for s in stock['sizes'] if s['size'] == 'one_liter')['quantity'], 30)

    def test_same_report_cannot_be_downloaded_twice(self):
        self.link_all()
        first = self.upload(self.ROWS).json()
        self.assertEqual(self.client.post(f"{API}/sales/imports/{first['id']}/confirm", json={}).status_code, 200)
        second = self.upload(self.ROWS).json()
        self.assertEqual(second['blocking'], ['duplicate'])
        r = self.client.post(f"{API}/sales/imports/{second['id']}/confirm", json={})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.deposit(), 40)
        self.assertEqual(self.client.post(f"{API}/sales/imports/{first['id']}/confirm", json={}).status_code, 400)   # já baixado

    def test_overlapping_period_needs_explicit_confirmation(self):
        self.link_all()
        first = self.upload(self.ROWS).json()
        self.client.post(f"{API}/sales/imports/{first['id']}/confirm", json={})
        later = self.upload([(6, 'PINHO GEL 2L', 'und', 10), (46, 'RODO 40 CM', 'und', 1)], start='16/11/2026', end='16/11/2026').json()
        self.assertEqual(len(later['overlaps']), 1)
        self.assertEqual(self.client.post(f"{API}/sales/imports/{later['id']}/confirm", json={}).status_code, 409)
        self.assertEqual(self.deposit(), 40)
        ok = self.client.post(f"{API}/sales/imports/{later['id']}/confirm", json={'allow_overlap': True})
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual(self.deposit(), 30)

    def test_incomplete_or_fractional_reports_are_blocked(self):
        self.link_all()
        bad = self.upload(self.ROWS, total=9999).json()
        self.assertEqual(bad['blocking'], ['incomplete'])
        self.assertEqual(self.client.post(f"{API}/sales/imports/{bad['id']}/confirm", json={}).status_code, 400)
        frac = self.client.post(f'{API}/sales/parse', files={'file': ('r.pdf', report([(6, 'PINHO GEL 2L', 'und', 1.5)]), 'application/pdf')}).json()
        self.assertEqual(frac['blocking'], ['fractional'])

    def test_undo_whole_import_returns_units_and_allows_reimport(self):
        self.link_all()
        first = self.upload(self.ROWS).json()
        self.client.post(f"{API}/sales/imports/{first['id']}/confirm", json={})
        self.assertEqual(self.deposit(), 40)
        r = self.client.post(f"{API}/sales/imports/{first['id']}/cancel")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.deposit(), 100)
        self.assertEqual(self.client.post(f"{API}/sales/imports/{first['id']}/cancel").status_code, 400)
        self.assertEqual(self.client.get(f"{API}/sales/imports/{first['id']}").json()['status'], 'cancelado')
        again = self.upload(self.ROWS).json()
        self.assertEqual(again['blocking'], [])        # relatório desfeito pode ser baixado de novo
        # baixa individual de venda não é permitida pelo Depósito
        done = self.client.post(f"{API}/sales/imports/{again['id']}/confirm", json={})
        self.assertEqual(done.status_code, 200)
        sale = next(m for m in self.client.get(f'{API}/deposit/movements').json() if m['origin'] == 'venda' and not m['cancelled'])
        self.assertEqual(self.client.post(f"{API}/deposit/movements/{sale['id']}/cancel").status_code, 400)

    def test_codes_validation_and_deleted_product_is_asked_again(self):
        bad_size = self.client.put(f'{API}/sales/codes', json={'items': [{'code': '1', 'action': 'map', 'product_id': 'pinho', 'size': 'one_kg'}]})
        self.assertEqual(bad_size.status_code, 400)
        self.assertEqual(self.client.put(f'{API}/sales/codes', json={'items': [{'code': '1', 'action': 'map', 'product_id': 'nao-existe', 'size': 'two_liter'}]}).status_code, 404)
        self.assertEqual(self.client.put(f'{API}/sales/codes', json={'items': [{'code': '1', 'action': 'apagar'}]}).status_code, 400)
        self.link_all()
        self.db.store.products.update_one({'id': 'pinho'}, {'$set': {'deleted': True}})
        state = self.upload(self.ROWS).json()
        stale = next(l for l in state['lines'] if l['code'] == '0000000000006')
        self.assertEqual((stale['status'], stale['stale']), ('unmapped', True))

    def test_nothing_from_the_pdf_is_stored_besides_code_name_unit_quantity(self):
        self.link_all()
        state = self.upload(self.ROWS).json()
        doc = self.db.store.sales_imports.find_one({'id': state['id']})
        self.assertTrue(all(set(l) == {'code', 'name', 'unit', 'quantity'} for l in doc['lines']))
        flat = repr(doc)
        self.assertNotIn('9,99', flat)
        self.assertNotIn('99,99', flat)
        self.assertFalse(any(isinstance(v, (bytes, bytearray)) for v in doc.values()))


if __name__ == '__main__':
    unittest.main()
