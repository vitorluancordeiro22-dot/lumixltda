#!/usr/bin/env python3
"""Restaura o BANCO DE DADOS a partir de um backup geral do Lumix (o .zip gerado em Configurações).

Uso (veja também o LEIA-ME-RESTAURAR.txt dentro do zip):

  python restore_backup.py backup.zip --mongo-url "mongodb://..." --db-name lumix_teste           # simulação
  python restore_backup.py backup.zip --mongo-url "mongodb://..." --db-name lumix_teste --apply   # grava
  python restore_backup.py backup.zip --mongo-url "mongodb://..." --db-name lumix --apply --replace

Segurança:
  - Sem --apply nada é gravado: só mostra o que seria feito.
  - Se o banco de destino já tem dados, recusa (nenhuma coleção é tocada) a menos que use --replace,
    que apaga SÓ as coleções que existem no backup antes de restaurá-las.
  - Recomendado: restaurar primeiro num banco NOVO (outro --db-name), conferir, e só então trocar o DB_NAME.
Precisa apenas do pacote pymongo (pip install pymongo).
"""
import argparse
import json
import sys
import zipfile

from bson import json_util

BATCH = 500
SKIP_INDEX_OPTIONS = {'v', 'key', 'ns'}


class RestoreError(Exception):
    pass


def read_manifest(zf: zipfile.ZipFile) -> dict:
    try:
        manifest = json.loads(zf.read('manifest.json'))
    except (KeyError, ValueError):
        raise RestoreError('Este arquivo não parece ser um backup do Lumix (manifest.json ausente ou inválido)')
    if 'database' not in manifest:
        raise RestoreError('Este backup foi feito sem o banco de dados: não há o que restaurar')
    return manifest


def restore_zip(zip_path, db, apply=False, replace=False, log=print) -> dict:
    """Restaura num banco PyMongo (síncrono). Retorna um resumo por coleção.

    apply=False  -> simulação (nada é gravado)
    replace=True -> apaga cada coleção do backup que já exista no destino antes de restaurá-la
    """
    with zipfile.ZipFile(zip_path) as zf:
        manifest = read_manifest(zf)
        collections = manifest['database']['collections']
        existing = set(db.list_collection_names())
        plan = []
        for name, info in sorted(collections.items()):
            if f'database/{name}.jsonl' not in zf.namelist():
                raise RestoreError(f'Backup incompleto: falta database/{name}.jsonl')
            target = db[name].count_documents({}) if name in existing else 0
            plan.append({'name': name, 'backup_count': info['count'], 'target_count': target,
                         'indexes': info.get('indexes', {})})

        conflicts = [p for p in plan if p['target_count'] > 0]
        log(f"Backup de {manifest.get('created_at', '?')} · {len(plan)} coleções · {manifest['database']['documents']} registros")
        for p in plan:
            note = f"  (destino já tem {p['target_count']})" if p['target_count'] else ''
            log(f"  {p['name']:32} {p['backup_count']:>7} registros{note}")

        if not apply:
            log('\nSIMULAÇÃO: nada foi gravado. Use --apply para restaurar.')
            if conflicts:
                log('O destino já tem dados em ' + ', '.join(p['name'] for p in conflicts) + ' → será preciso --replace.')
            return {'applied': False, 'plan': plan}
        if conflicts and not replace:
            raise RestoreError(
                'O banco de destino já tem dados em: ' + ', '.join(p['name'] for p in conflicts)
                + '. Nada foi alterado. Use outro --db-name (recomendado) ou --replace para substituir.')

        results = {}
        for p in plan:
            name, coll = p['name'], db[p['name']]
            if replace and p['target_count'] > 0:
                coll.drop()
            inserted, batch = 0, []
            with zf.open(f'database/{name}.jsonl') as handle:
                for raw in handle:
                    raw = raw.strip()
                    if not raw:
                        continue
                    batch.append(json_util.loads(raw.decode('utf-8')))
                    if len(batch) >= BATCH:
                        coll.insert_many(batch, ordered=False)
                        inserted += len(batch)
                        batch = []
            if batch:
                coll.insert_many(batch, ordered=False)
                inserted += len(batch)
            for index_name, spec in p['indexes'].items():
                if index_name == '_id_':
                    continue
                options = {k: v for k, v in spec.items() if k not in SKIP_INDEX_OPTIONS}
                try:
                    coll.create_index([(k, d) for k, d in spec['key']], name=index_name, **options)
                except Exception as exc:
                    log(f'  aviso: índice {index_name} de {name} não foi recriado ({exc})')
            final = coll.count_documents({})
            if final != p['backup_count']:
                raise RestoreError(f'Conferência falhou em {name}: backup tem {p["backup_count"]}, banco ficou com {final}')
            results[name] = inserted
            log(f'  ✓ {name}: {inserted} registros')

        if 'stock_control' in results:   # nunca restaurar uma trava de estoque "ocupada"
            db['stock_control'].update_many({'owner': {'$ne': None}}, {'$set': {'owner': None}})
        log(f'\nRestauração concluída: {sum(results.values())} registros em {len(results)} coleções.')
        return {'applied': True, 'plan': plan, 'restored': results}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Restaura o banco de dados de um backup geral do Lumix')
    parser.add_argument('zip', help='arquivo .zip do backup')
    parser.add_argument('--mongo-url', required=True, help='endereço do MongoDB (mongodb://...)')
    parser.add_argument('--db-name', required=True, help='nome do banco de destino (prefira um NOVO para testar)')
    parser.add_argument('--apply', action='store_true', help='grava de verdade (sem isso é só simulação)')
    parser.add_argument('--replace', action='store_true', help='substitui coleções que já existem no destino')
    args = parser.parse_args(argv)
    try:
        from pymongo import MongoClient
    except ImportError:
        print('Falta o pymongo. Instale com: pip install pymongo', file=sys.stderr)
        return 2
    client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=10000)
    try:
        restore_zip(args.zip, client[args.db_name], apply=args.apply, replace=args.replace)
    except RestoreError as exc:
        print(f'ERRO: {exc}', file=sys.stderr)
        return 1
    finally:
        client.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
