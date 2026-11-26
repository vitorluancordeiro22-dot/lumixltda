# Backup geral (Configurações)

**Base:** os patches anteriores já aplicados (até `lumix-lote-aberto-contagem-parcial.patch`).
**Patch:** `updates/lumix-backup-geral.patch` (8 arquivos, sem dependência nova, sem mudança no banco além de uma coleção nova de histórico: `backup_log`).

## O que é
Em **Configurações → Backup geral** (só Laboratório) um botão gera **um arquivo .zip** com:
- **Banco de dados:** todas as coleções, inclusive os arquivos do GridFS (laudos, modelos, PDFs);
- **Código do site:** backend e frontend;
- `manifest.json` (o que foi salvo, quando, commit do código, **nomes** das variáveis de ambiente) e `LEIA-ME-RESTAURAR.txt`.

O arquivo é gerado em segundo plano (a tela mostra o andamento) e baixado direto para o seu computador. No servidor ele fica só por 6 horas, numa pasta temporária fora do projeto.

## O que NÃO entra (de propósito)
- Arquivos `.env`, chaves (`.pem`, `.key`) e credenciais. **Guarde o `.env` separadamente.**
- `node_modules`, `build`, `.git` e outros backups/dumps que estejam dentro do projeto.
- Travas temporárias do estoque.

## Restaurar
O programa `backend/restore_backup.py` vem dentro do backup. Ele **simula** por padrão, **recusa** gravar em banco que já tem dados (a menos que use `--replace`) e confere as quantidades no final. Passo a passo no `LEIA-ME-RESTAURAR.txt` dentro do zip.

## Passo a passo (uma linha por vez)
```
cd /app
git status --short
git branch backup-antes-backup-geral
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-backup-geral.patch > /tmp/lumix-backup.patch
git apply --check /tmp/lumix-backup.patch
```
Se o `--check` não mostrar nada:
```
git apply /tmp/lumix-backup.patch
sudo supervisorctl restart backend
```
Atualize a página (F5) e abra Configurações.

## Impedir backups de irem para o Git (faça uma vez)
```
cd /app
printf '\n# Backups e dumps do banco NUNCA devem ir para o Git\nbackup-*/\nbackup-*.gz\n*.archive.gz\nlumix-backup-*.zip\n' >> .gitignore
```

## Salvar (depois de testar)
```
git add backend/backup.py backend/restore_backup.py backend/server.py backend/unit_tests/test_backup.py frontend/src/components/BackupManager.js frontend/src/pages/Settings.js .gitignore
git commit -m "Backup geral em Configurações"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-backup.patch
sudo supervisorctl restart backend
```

## ATENÇÃO: dump do banco dentro do Git
O repositório tem uma pasta `backup-lumix-json-final/`, `backup-lumix-bson-2026-09-03/` e o arquivo `backup-lumix-2026-09-03.archive.gz` (commit `202187b`, de 03/09/2026), com **hashes de senha de 14 usuários**, fornecedores, pedidos e arquivos de laudos. Se o repositório é público, esses dados estão expostos. Veja as recomendações na conversa.
