"""Backup geral — testes offline (mongomock, sem MongoDB real, sem rede).

PYTHONPATH=backend python -m unittest discover -s backend/unit_tests -v
"""
import asyncio
import datetime
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mongomock
from bson import ObjectId
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

import backup
import restore_backup
from restore_backup import RestoreError, restore_zip

SECRET = 'SEGREDO-NAO-PODE-VAZAR-123'


class AsyncCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def sort(self, *args):
        self.cursor = self.cursor.sort(*args)
        return self

    async def to_list(self, limit):
        return list(self.cursor) if limit is None else list(self.cursor.limit(limit))

    def __aiter__(self):
        self._it = iter(self.cursor)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class AsyncColl:
    def __init__(self, coll):
        self.coll = coll

    def find(self, *a, **k):
        return AsyncCursor(self.coll.find(*a, **k))

    def __getattr__(self, method):
        async def call(*a, **k):
            return getattr(self.coll, method)(*a, **k)
        return call


class AsyncDB:
    """Mesma interface assíncrona que o motor, em cima do mongomock."""

    def __init__(self, sync_db):
        self.sync = sync_db

    async def list_collection_names(self):
        return self.sync.list_collection_names()

    def __getitem__(self, name):
        return AsyncColl(self.sync[name])

    __getattr__ = __getitem__


def sample_db(name='origem'):
    db = mongomock.MongoClient()[name]
    db.users.insert_one({'id': 'u1', 'email': 'a@lumix.com', 'password': '$2b$hash', 'name': 'Zé Açúcar ✓'})
    db.users.create_index('email', unique=True)
    db.products.insert_many([{'id': f'p{i}', 'name': f'Produto {i}', 'recipes': [{'q': 1.5, 'unit': 'L'}], 'deleted': False} for i in range(1234)])
    db.laudo_files.insert_one({'_id': ObjectId(), 'id': 'f1', 'uploadDate': datetime.datetime(2026, 11, 1, 12, 30, 15, 123000)})
    db['fs.chunks'].insert_one({'_id': ObjectId(), 'files_id': ObjectId(), 'n': 0, 'data': bytes(range(256)) * 4})
    db.stock_control.insert_one({'_id': 'inventory', 'owner': 'travado-por-alguem', 'revision': 7})
    db.finished_stock_locks.insert_one({'_id': 'p1', 'owner': 'x'})
    return db


def code_tree(root: Path):
    files = {
        'backend/server.py': 'print("oi")',
        'backend/.env': f'MONGO_URL=mongodb://x\nJWT_SECRET={SECRET}\n',
        'backend/.env.production': f'OUTRO={SECRET}',
        'frontend/.env': f'REACT_APP_BACKEND_URL={SECRET}',
        'frontend/src/App.js': 'export default 1;',
        'frontend/node_modules/lib/x.js': 'x',
        'frontend/build/main.js': 'x',
        '.git/config': 'x',
        'backend/__pycache__/s.pyc': 'x',
        'backend/chave.pem': SECRET,
        'backup-lumix-json-final/users.json': '{"password": "hash"}',
        'backup-lumix-2026-09-03.archive.gz': 'x',
        'updates/a.patch': 'diff',
        'README.md': '# lumix',
    }
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    (root / '.git' / 'HEAD').write_text('ref: refs/heads/main\n')
    (root / '.git' / 'refs' / 'heads').mkdir(parents=True, exist_ok=True)
    (root / '.git' / 'refs' / 'heads' / 'main').write_text('abc123' + '0' * 34 + '\n')
    (root / 'frontend' / 'big.bin').write_bytes(b'0' * 2048)


class ExportAndRestore(unittest.TestCase):
    def export(self, db):
        buffer = io.BytesIO()
        ticks = []
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            summary = asyncio.run(backup.export_database(AsyncDB(db), zf, lambda **kw: ticks.append(kw)))
        return buffer, summary, ticks

    def test_database_export_has_every_collection_but_not_the_locks(self):
        buffer, summary, ticks = self.export(sample_db())
        names = zipfile.ZipFile(buffer).namelist()
        self.assertIn('database/products.jsonl', names)
        self.assertIn('database/fs.chunks.jsonl', names)           # arquivos do GridFS entram
        self.assertNotIn('database/finished_stock_locks.jsonl', names)
        self.assertEqual(summary['collections']['products']['count'], 1234)
        self.assertEqual(summary['documents'], 1234 + 1 + 1 + 1 + 1)
        self.assertTrue(any('products' in t.get('detail', '') for t in ticks))   # a tela recebe o andamento

    def test_round_trip_restores_exactly_what_was_saved(self):
        source = sample_db()
        buffer, summary, _ = self.export(source)
        manifest = {'created_at': 'hoje', 'database': summary}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'b.zip'
            with zipfile.ZipFile(buffer) as src, zipfile.ZipFile(path, 'w') as dst:
                for item in src.namelist():
                    dst.writestr(item, src.read(item))
                dst.writestr('manifest.json', json.dumps(manifest))
            target = mongomock.MongoClient()['destino']
            result = restore_zip(path, target, apply=True, log=lambda *_: None)
        self.assertTrue(result['applied'])
        for name in ('users', 'products', 'laudo_files', 'fs.chunks'):
            self.assertEqual(sorted(map(repr, source[name].find({}, {'uploadDate': 0}))),
                             sorted(map(repr, target[name].find({}, {'uploadDate': 0}))), name)
        self.assertEqual(target['fs.chunks'].find_one()['data'], bytes(range(256)) * 4)        # binário intacto
        self.assertEqual(target.users.find_one()['name'], 'Zé Açúcar ✓')                        # acentos
        got = target.laudo_files.find_one()['uploadDate']
        self.assertEqual(got.replace(tzinfo=None), datetime.datetime(2026, 11, 1, 12, 30, 15, 123000))
        self.assertTrue(target.users.index_information()['email_1']['unique'])                  # índices voltam
        self.assertIsNone(target.stock_control.find_one({'_id': 'inventory'})['owner'])         # trava não volta ocupada
        self.assertEqual(target.stock_control.find_one({'_id': 'inventory'})['revision'], 7)
        self.assertNotIn('finished_stock_locks', target.list_collection_names())

    def make_zip(self, tmp, db=None):
        buffer, summary, _ = self.export(db or sample_db())
        path = Path(tmp) / 'b.zip'
        with zipfile.ZipFile(buffer) as src, zipfile.ZipFile(path, 'w') as dst:
            for item in src.namelist():
                dst.writestr(item, src.read(item))
            dst.writestr('manifest.json', json.dumps({'created_at': 'hoje', 'database': summary}))
        return path

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = mongomock.MongoClient()['destino']
            result = restore_zip(self.make_zip(tmp), target, apply=False, log=lambda *_: None)
        self.assertFalse(result['applied'])
        self.assertEqual(target.list_collection_names(), [])

    def test_refuses_to_touch_a_database_that_already_has_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_zip(tmp)
            target = mongomock.MongoClient()['destino']
            target.products.insert_one({'id': 'existente'})
            with self.assertRaisesRegex(RestoreError, 'Nada foi alterado'):
                restore_zip(path, target, apply=True, log=lambda *_: None)
            self.assertEqual(target.products.count_documents({}), 1)                 # nada mudou
            self.assertEqual(target.users.count_documents({}), 0)                    # nem as outras coleções
            restore_zip(path, target, apply=True, replace=True, log=lambda *_: None)  # com --replace substitui
            self.assertEqual(target.products.count_documents({}), 1234)
            self.assertIsNone(target.products.find_one({'id': 'existente'}))

    def test_rejects_files_that_are_not_a_lumix_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / 'x.zip'
            with zipfile.ZipFile(bad, 'w') as zf:
                zf.writestr('qualquer.txt', 'oi')
            with self.assertRaisesRegex(RestoreError, 'não parece ser um backup'):
                restore_zip(bad, mongomock.MongoClient()['d'], apply=True, log=lambda *_: None)
            code_only = Path(tmp) / 'c.zip'
            with zipfile.ZipFile(code_only, 'w') as zf:
                zf.writestr('manifest.json', json.dumps({'code': {}}))
            with self.assertRaisesRegex(RestoreError, 'sem o banco'):
                restore_zip(code_only, mongomock.MongoClient()['d'], apply=True, log=lambda *_: None)

    def test_incomplete_backup_is_detected_before_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_zip(tmp)
            broken = Path(tmp) / 'quebrado.zip'
            with zipfile.ZipFile(path) as src, zipfile.ZipFile(broken, 'w') as dst:
                for item in src.namelist():
                    if item != 'database/users.jsonl':
                        dst.writestr(item, src.read(item))
            target = mongomock.MongoClient()['destino']
            with self.assertRaisesRegex(RestoreError, 'falta database/users.jsonl'):
                restore_zip(broken, target, apply=True, log=lambda *_: None)
            self.assertEqual(target.list_collection_names(), [])

    def test_command_line_reports_errors_with_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / 'x.zip'
            with zipfile.ZipFile(bad, 'w') as zf:
                zf.writestr('a', 'b')
            with patch('pymongo.MongoClient', return_value=mongomock.MongoClient()):
                self.assertEqual(restore_backup.main([str(bad), '--mongo-url', 'mongodb://x', '--db-name', 'd']), 1)


class CodeExport(unittest.TestCase):
    def test_code_backup_has_source_but_no_secrets_dependencies_or_old_dumps(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'app'
            code_tree(root)
            buffer = io.BytesIO()
            with patch.object(backup, 'MAX_CODE_FILE_BYTES', 1024):
                with zipfile.ZipFile(buffer, 'w') as zf:
                    info = backup.export_code(root, zf, lambda **kw: None)
            names = set(zipfile.ZipFile(buffer).namelist())
            self.assertEqual(names, {'code/backend/server.py', 'code/frontend/src/App.js', 'code/updates/a.patch', 'code/README.md'})
            self.assertEqual([s['file'] for s in info['skipped']], ['frontend/big.bin'])
            raw = buffer.getvalue()
            self.assertNotIn(SECRET.encode(), raw)                       # nenhum valor secreto no arquivo
            self.assertEqual(backup.env_variable_names(root), ['backend/JWT_SECRET', 'backend/MONGO_URL', 'frontend/REACT_APP_BACKEND_URL'])
            self.assertEqual(backup.git_commit(root), 'abc123' + '0' * 34)


class BackupEndpoints(unittest.TestCase):
    LAB = {'id': 'lab', 'name': 'Lab', 'email': 'laboratoriolumix@outlook.com'}
    OTHER = {'id': 'op', 'name': 'Operador', 'email': 'producao@lumix.com'}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'app'
        code_tree(self.root)
        self.sync_db = sample_db()
        self.patch = patch.object(backup, 'BACKUP_DIR', Path(self.tmp.name) / 'saida')
        self.patch.start()
        backup.JOBS.clear()

    def tearDown(self):
        self.patch.stop()
        backup.JOBS.clear()
        self.tmp.cleanup()

    def client(self, user=None):
        async def fake_user():
            return user or self.LAB
        app, router = FastAPI(), APIRouter(prefix='/api')
        backup.setup_backup_routes(router, AsyncDB(self.sync_db), fake_user, self.root)
        app.include_router(router)
        return TestClient(app)

    def test_only_laboratorio_can_use_it(self):
        other = self.client(self.OTHER)
        self.assertEqual(other.get('/api/backup/status').status_code, 403)
        self.assertEqual(other.post('/api/backup/start', json={}).status_code, 403)

    def test_full_flow_start_wait_link_and_download(self):
        client = self.client()
        self.assertEqual(client.get('/api/backup/status').json()['last'], None)
        started = client.post('/api/backup/start', json={'database': True, 'code': True})
        self.assertEqual(started.status_code, 200, started.text)
        status = client.get('/api/backup/status').json()
        self.assertEqual(status['job']['status'], 'done', status)
        self.assertGreater(status['job']['size_bytes'], 0)
        self.assertNotIn('path', status['job'])                                    # caminho do servidor não vaza
        last = status['last']
        self.assertEqual((last['by'], last['database'], last['code'], last['collections']), ('Lab', True, True, 5))
        link = client.post(f"/api/backup/{status['job']['id']}/download-link").json()
        file = client.get(link['url'])
        self.assertEqual((file.status_code, file.headers['content-type']), (200, 'application/zip'))
        self.assertIn('lumix-backup-', file.headers['content-disposition'])
        zf = zipfile.ZipFile(io.BytesIO(file.content))
        self.assertIsNone(zf.testzip())
        manifest = json.loads(zf.read('manifest.json'))
        self.assertEqual(manifest['created_by'], 'Lab')
        self.assertEqual(manifest['database']['collections']['products']['count'], 1234)
        self.assertEqual(manifest['code']['files'], 5)   # inclui big.bin (2 KB, abaixo do limite)
        self.assertIn('database/users.jsonl', zf.namelist())
        self.assertIn('LEIA-ME-RESTAURAR.txt', zf.namelist())
        self.assertNotIn(SECRET.encode(), file.content)

    def test_download_needs_a_valid_unexpired_link(self):
        client = self.client()
        client.post('/api/backup/start', json={})
        job_id = client.get('/api/backup/status').json()['job']['id']
        self.assertEqual(client.get(f'/api/backup/download/{job_id}').status_code, 422)                       # sem token
        self.assertEqual(client.get(f'/api/backup/download/{job_id}?token=errado-errado-errado').status_code, 403)
        url = client.post(f'/api/backup/{job_id}/download-link').json()['url']
        self.assertEqual(client.get(url).status_code, 200)
        backup.JOBS[job_id]['token_expires'] = 0                                                              # expirou
        self.assertEqual(client.get(url).status_code, 403)

    def test_parts_can_be_chosen_and_at_least_one_is_required(self):
        client = self.client()
        self.assertEqual(client.post('/api/backup/start', json={'database': False, 'code': False}).status_code, 400)
        client.post('/api/backup/start', json={'database': False, 'code': True})
        job = client.get('/api/backup/status').json()['job']
        names = zipfile.ZipFile(io.BytesIO(client.get(client.post(f"/api/backup/{job['id']}/download-link").json()['url']).content)).namelist()
        self.assertFalse(any(n.startswith('database/') for n in names))
        self.assertTrue(any(n.startswith('code/') for n in names))

    def test_second_backup_is_refused_while_one_is_running(self):
        client = self.client()
        backup.JOBS['x'] = {'id': 'x', 'status': 'running', 'created_at_ts': 9e12}
        self.assertEqual(client.post('/api/backup/start', json={}).status_code, 409)

    def test_failure_is_reported_and_leaves_no_partial_file(self):
        client = self.client()
        with patch.object(backup, 'export_database', side_effect=RuntimeError('banco caiu')):
            client.post('/api/backup/start', json={})
        job = client.get('/api/backup/status').json()['job']
        self.assertEqual(job['status'], 'error')
        self.assertIn('banco caiu', job['error'])
        self.assertEqual(list((Path(self.tmp.name) / 'saida').glob('*.zip')), [])
        self.assertEqual(client.post(f"/api/backup/{job['id']}/download-link").status_code, 404)

    def test_old_files_are_swept_from_the_server(self):
        folder = Path(self.tmp.name) / 'saida'
        folder.mkdir(parents=True)
        old = folder / 'lumix-backup-velho.zip'
        old.write_bytes(b'x')
        backup.sweep_old_files(now=old.stat().st_mtime + (backup.KEEP_HOURS + 1) * 3600)
        self.assertFalse(old.exists())


if __name__ == '__main__':
    unittest.main()
