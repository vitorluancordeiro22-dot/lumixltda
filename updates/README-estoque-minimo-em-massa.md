# Estoque mínimo em massa — como aplicar no Emergent

**Base:** commit `ccb0159` (Estoque de produto acabado, já em produção).
**Patch:** `updates/lumix-estoque-minimo-em-massa.patch`, com 4 arquivos.

## O que muda
- Novo botão **Estoque mínimo** na aba Estoque (só Laboratório), com duas abas:
  - **Aplicar a vários:** digite o padrão (ex.: 2L = 20, 5L = 10), filtre e marque os produtos e clique em **Aplicar**.
  - **Tabela:** uma linha por produto. Digite e use Enter/Tab para ir ao próximo campo. **Salvar alterações** grava tudo de uma vez.
- O mínimo nunca esconde tamanhos de um produto.
- Um tamanho que ainda tem estoque continua aparecendo e aceitando saída, mesmo que seja desmarcado no produto.
- **Banco:** não há coleção nova. Só preenche `stock_minimums`/`stock_sizes` nos produtos que você editar.

## Passo a passo (uma linha por vez)
```
cd /app
git log -1 --oneline
```
O último comando precisa mostrar `ccb0159 Estoque de produto acabado...`. Se aparecer outra coisa, pare.

```
git branch backup-antes-minimo-massa
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-estoque-minimo-em-massa.patch > /tmp/lumix-minimo.patch
git apply --check /tmp/lumix-minimo.patch
```
Se o `--check` não mostrar nada, aplique e reinicie:
```
git apply /tmp/lumix-minimo.patch
git --no-pager diff --stat
sudo supervisorctl restart backend
```

## Salvar (depois de testar na tela)
```
git add backend/finished_stock.py backend/unit_tests/test_finished_stock.py frontend/src/components/MinimumsManager.js frontend/src/pages/Estoque.js
git commit -m "Estoque mínimo em massa: aplicar a vários e tabela"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-minimo.patch
sudo supervisorctl restart backend
```
