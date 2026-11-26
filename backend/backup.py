"""Backup geral do Lumix: banco de dados + código do site, num único arquivo .zip.

O que entra:
  database/<coleção>.jsonl   todas as coleções (inclui os arquivos do GridFS: laudos, modelos, PDFs)
  code/...                   o código do site (backend + frontend), sem node_modules, build e .git
  manifest.json              o que foi salvo, quando, e os NOMES das variáveis de ambiente (nunca os valores)
  LEIA-ME-RESTAURAR.txt      passo a passo para restaurar

O que NÃO entra, de propósito:
  - arquivos .env, chaves (.pem/.key) e credenciais: o backup é um arquivo que sai do servidor;
  - locks temporários do estoque (finished_stock_locks);
  - outros backups e dumps que estejam na pasta do projeto.

O arquivo é gerado em segundo plano (pode demorar) numa pasta temporária fora do projeto e é baixado
por um link de uso curto. Somente o Laboratório pode gerar e baixar.
"""
import asyncio
import hmac
import json
import logging
import os
import re
import secrets
import shutil
import tempfile
import time
import zipfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional
from uuid import uuid4

from bson import json_util
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from deposit_sales import lab_emails

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(tempfile.gettempdir()) / 'lumix-backups'   # fora do projeto: não dispara o reload do servidor
EXCLUDED_COLLECTIONS = {'finished_stock_locks'}              # travas temporárias: restaurar uma travada bloquearia o estoque
EXCLUDED_DIRS = {'.git', 'node_modules', 'build', 'dist', '__pycache__', '.venv', 'venv', '.cache', '.pytest_cache', 'coverage'}
EXCLUDED_DIR_PREFIXES = ('backup-', 'backups')               # dumps antigos dentro do projeto
SECRET_FILE = re.compile(r'^(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|\.git-credentials|\.netrc)$', re.I)
EXCLUDED_SUFFIXES = ('.pyc', '.archive.gz')
MAX_CODE_FILE_BYTES = 25 * 1024 * 1024
KEEP_HOURS = 6        # arquivos gerados ficam no servidor só por algumas horas (o certo é baixar e guardar fora)
LINK_MINUTES = 10     # validade do link de download
JOBS: dict = {}       # jobs em memória (um por vez)

README_TEXT = """LUMIX — BACKUP GERAL
====================

Este arquivo (.zip) guarda o sistema inteiro num dia só:
  database/        o banco de dados (cada coleção num arquivo .jsonl), inclusive os arquivos de laudos e modelos
  code/            o código do site (backend e frontend)
  manifest.json    o que foi salvo, quando, e os NOMES das variáveis de ambiente (os valores NÃO estão aqui)

ATENÇÃO: este arquivo contém dados da empresa e os "hashes" das senhas dos usuários.
Guarde em lugar privado (HD externo, Google Drive pessoal) e NUNCA publique nem envie para o GitHub.

COMO RESTAURAR
--------------
1) Código do site
   - Descompacte o .zip e copie a pasta code/ para o servidor (ela vira a pasta do projeto).
   - Recrie o arquivo backend/.env. Ele não vem no backup por segurança. Os nomes das variáveis
     estão em manifest.json (env_variable_names). Os valores você guarda separadamente.
   - Instale as dependências: pip install -r backend/requirements.txt  e  yarn install (na pasta frontend).

2) Banco de dados (recomendo testar primeiro num banco NOVO, sem apagar nada)
   - pip install pymongo
   - Simulação (não grava nada):
       python code/backend/restore_backup.py ESTE-ARQUIVO.zip --mongo-url "mongodb://..." --db-name lumix_teste
   - Restaurar de verdade num banco vazio:
       python code/backend/restore_backup.py ESTE-ARQUIVO.zip --mongo-url "mongodb://..." --db-name lumix_teste --apply
   - Se o banco de destino já tem dados e você quer SUBSTITUIR (apaga as coleções antes):
       acrescente --replace
   - Confira o sistema usando o banco restaurado. Só depois aponte o DB_NAME do .env para ele.
"""


# ---------- exportação ----------

def _now():
    return datetime.now(timezone.utc)


def _jsonable(value):
    return json.loads(json_util.dumps(value))


async def export_database(db, zf: zipfile.ZipFile, tick) -> dict:
    """Grava cada coleção em database/<nome>.jsonl (Extended JSON: ObjectId, datas e binários são preservados)."""
    names = sorted(n for n in await db.list_collection_names()
                   if n not in EXCLUDED_COLLECTIONS and not n.startswith('system.'))
    summary, total_docs = {}, 0
    for position, name in enumerate(names, 1):
        coll, count = db[name], 0
        with zf.open(f'database/{name}.jsonl', 'w', force_zip64=True) as out:
            async for doc in coll.find({}):
                out.write((json_util.dumps(doc) + '\n').encode('utf-8'))
                count += 1
                if count % 200 == 0:
                    tick(step='Banco de dados', detail=f'{name} ({count} registros)')
                    await asyncio.sleep(0)
        try:
            indexes = _jsonable(await coll.index_information())
        except Exception:   # pragma: no cover - banco sem suporte a índices
            indexes = {}
        summary[name] = {'count': count, 'indexes': indexes}
        total_docs += count
        tick(step='Banco de dados', detail=f'{name}', collections_done=position, collections_total=len(names), documents=total_docs)
    return {'collections': summary, 'documents': total_docs}


def _walk_code(root: Path):
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDED_DIRS and not d.startswith(EXCLUDED_DIR_PREFIXES))
        for filename in sorted(filenames):
            yield Path(dirpath) / filename


def export_code(root: Path, zf: zipfile.ZipFile, tick) -> dict:
    """Copia o código para code/..., sem segredos, dependências instaladas, builds e dumps."""
    files, skipped, total = 0, [], 0
    for path in _walk_code(root):
        name = path.name
        if SECRET_FILE.match(name) or name.endswith(EXCLUDED_SUFFIXES) or path.is_symlink():
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size > MAX_CODE_FILE_BYTES:
            skipped.append({'file': str(path.relative_to(root)), 'bytes': size, 'reason': 'arquivo grande demais'})
            continue
        zf.write(path, f'code/{path.relative_to(root).as_posix()}')
        files += 1
        total += size
        if files % 100 == 0:
            tick(step='Código do site', detail=str(path.relative_to(root)), code_files=files)
    tick(step='Código do site', detail='concluído', code_files=files)
    return {'files': files, 'bytes': total, 'skipped': skipped}


def env_variable_names(root: Path) -> list:
    """Só os NOMES das variáveis dos .env do projeto: serve de lista de conferência na restauração."""
    names = set()
    for candidate in (root / 'backend' / '.env', root / 'frontend' / '.env'):
        try:
            for line in candidate.read_text(encoding='utf-8', errors='ignore').splitlines():
                match = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=', line)
                if match:
                    names.add(f'{candidate.parent.name}/{match.group(1)}')
        except OSError:
            continue
    return sorted(names)


def git_commit(root: Path) -> Optional[str]:
    """Commit do código (lido do .git, sem precisar do programa git). Melhor esforço."""
    try:
        head = (root / '.git' / 'HEAD').read_text().strip()
        if not head.startswith('ref: '):
            return head[:40]
        ref = head[5:]
        ref_file = root / '.git' / ref
        if ref_file.exists():
            return ref_file.read_text().strip()[:40]
        for line in (root / '.git' / 'packed-refs').read_text().splitlines():
            if line.endswith(' ' + ref):
                return line.split(' ')[0][:40]
    except OSError:
        pass
    return None


def _public(job: dict) -> dict:
    hidden = {'path', 'token', 'token_expires'}
    return {k: v for k, v in job.items() if k not in hidden}


def sweep_old_files(now: Optional[float] = None):
    now = now or time.time()
    if not BACKUP_DIR.exists():
        return
    for path in BACKUP_DIR.glob('lumix-backup-*.zip'):
        try:
            if now - path.stat().st_mtime > KEEP_HOURS * 3600:
                path.unlink()
        except OSError:
            pass


async def run_backup(db, root: Path, job: dict):
    """Gera o arquivo. Atualiza job['progress'] para a tela acompanhar."""
    progress = job['progress']

    def tick(**kw):
        progress.update(kw)

    stamp = _now().astimezone(timezone(timedelta(hours=-3))).strftime('%Y-%m-%d-%H%M')
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    path = BACKUP_DIR / f'lumix-backup-{stamp}-{job["id"][:6]}.zip'
    job['path'], job['filename'] = str(path), path.name
    manifest = {'app': 'Lumix', 'created_at': _now().isoformat(), 'created_by': job['created_by'],
                'git_commit': git_commit(root), 'env_variable_names': env_variable_names(root),
                'format': 1, 'options': job['options']}
    try:
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zf:
            if job['options']['database']:
                manifest['database'] = await export_database(db, zf, tick)
            if job['options']['code']:
                tick(step='Código do site', detail='lendo arquivos...')
                manifest['code'] = await asyncio.to_thread(export_code, root, zf, tick)
            tick(step='Finalizando', detail='')
            zf.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
            zf.writestr('LEIA-ME-RESTAURAR.txt', README_TEXT)
        size = path.stat().st_size
        job.update(status='done', size_bytes=size, finished_at=_now().isoformat())
        await db.backup_log.insert_one({
            'id': job['id'], 'finished_at': job['finished_at'], 'by': job['created_by'], 'size_bytes': size,
            'filename': path.name, 'database': job['options']['database'], 'code': job['options']['code'],
            'collections': len(manifest.get('database', {}).get('collections', {})),
            'documents': manifest.get('database', {}).get('documents', 0),
            'code_files': manifest.get('code', {}).get('files', 0)})
    except Exception as exc:
        logger.exception('Falha ao gerar o backup')
        job.update(status='error', error=f'{type(exc).__name__}: {str(exc)[:200]}', finished_at=_now().isoformat())
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


# ---------- rotas ----------

class BackupOptions(BaseModel):
    database: bool = True
    code: bool = True


def setup_backup_routes(api_router: APIRouter, db, get_current_user, root: Path):
    router = APIRouter(prefix='/backup')

    async def lab_user(current_user=Depends(get_current_user)):
        if (current_user.get('email') or '').strip().lower() not in lab_emails():
            raise HTTPException(status_code=403, detail='Somente o Laboratório pode fazer e baixar o backup')
        return current_user

    def current_job():
        return max(JOBS.values(), key=lambda j: j['created_at_ts'], default=None)

    @router.get('/status')
    async def status(current_user=Depends(lab_user)):
        job = current_job()
        last = await db.backup_log.find({}, {'_id': 0}).sort('finished_at', -1).to_list(1)
        try:
            free_mb = int(shutil.disk_usage(BACKUP_DIR if BACKUP_DIR.exists() else Path(tempfile.gettempdir())).free / 1_048_576)
        except OSError:
            free_mb = None
        return {'job': _public(job) if job else None, 'last': last[0] if last else None, 'free_disk_mb': free_mb}

    @router.post('/start')
    async def start(options: BackupOptions, background: BackgroundTasks, current_user=Depends(lab_user)):
        if not (options.database or options.code):
            raise HTTPException(status_code=400, detail='Escolha pelo menos uma parte: banco de dados ou código')
        running = current_job()
        if running and running['status'] == 'running':
            raise HTTPException(status_code=409, detail='Já existe um backup sendo feito. Aguarde terminar')
        sweep_old_files()
        for old_id in [k for k, v in JOBS.items() if v['status'] != 'running']:
            JOBS.pop(old_id, None)
        job = {'id': str(uuid4()), 'status': 'running', 'created_at': _now().isoformat(), 'created_at_ts': time.time(),
               'created_by': current_user.get('name') or current_user.get('email', ''),
               'options': options.model_dump(), 'progress': {'step': 'Começando', 'detail': ''},
               'size_bytes': None, 'error': None}
        JOBS[job['id']] = job
        background.add_task(run_backup, db, root, job)
        return _public(job)

    @router.post('/{job_id}/download-link')
    async def download_link(job_id: str, current_user=Depends(lab_user)):
        job = JOBS.get(job_id)
        if not job or job['status'] != 'done' or not Path(job['path']).exists():
            raise HTTPException(status_code=404, detail='Backup não encontrado ou já expirou. Faça um novo')
        job['token'] = secrets.token_urlsafe(32)
        job['token_expires'] = time.time() + LINK_MINUTES * 60
        return {'url': f'/api/backup/download/{job_id}?token={job["token"]}', 'expires_minutes': LINK_MINUTES,
                'filename': job['filename'], 'size_bytes': job['size_bytes']}

    @router.get('/download/{job_id}')
    async def download(job_id: str, token: str = Query(min_length=10)):
        """Download direto pelo navegador: o link de uso curto (gerado por quem é do Laboratório) é a autorização."""
        job = JOBS.get(job_id)
        valid = bool(job and job.get('token') and time.time() < job.get('token_expires', 0)
                     and hmac.compare_digest(job['token'], token))
        if not valid or job['status'] != 'done' or not Path(job['path']).exists():
            raise HTTPException(status_code=403, detail='Link inválido ou expirado. Gere um novo na tela de Configurações')
        return FileResponse(job['path'], media_type='application/zip', filename=job['filename'],
                            headers={'Cache-Control': 'no-store'})

    api_router.include_router(router)
