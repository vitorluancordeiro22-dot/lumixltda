# Contagem parcial (lote ainda aberto) aparece para guardar

**Base:** os patches anteriores já aplicados (até `lumix-whatsapp-sem-numero.patch`).
**Patch:** `updates/lumix-lote-aberto-contagem-parcial.patch` (4 arquivos, sem dependência nova).

## O problema
O painel "Lotes aguardando destino" só mostrava lote **finalizado**. Num lote de 1000 L em que hoje se engarrafam 400, o lote continua aberto e essas 400 garrafas ficavam paradas na produção, sem aparecer no Estoque nem no Depósito.

## O que muda
- O painel agora mostra **lote aberto com contagem parcial** (etiqueta "lote aberto · contagem parcial"). Cada garrafa contada aparece para ser guardada na hora: **Tudo para o Depósito** ou **Dividir** entre Estoque e Depósito.
- Quando contarem **mais garrafas no mesmo lote** (outro dia), só o que é novo volta a aparecer (ex.: dos 600 restantes).
- **Lote aberto aparece sempre**, mesmo antigo. Lote finalizado/arquivado só aparece se for dos últimos 30 dias.
- O botão de **ignorar** (olho riscado) vale só para o que já tinha sido contado: se contarem mais depois, volta a aparecer.
- A Contagem não é alterada. Nenhum saldo muda sem alguém tocar num botão.
- **Banco:** nada novo; a coleção `pending_dismissed` passa a guardar também quantas garrafas já estavam contadas ao ignorar.

## Passo a passo (uma linha por vez)
```
cd /app
git status --short
git branch backup-antes-lote-aberto
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-lote-aberto-contagem-parcial.patch > /tmp/lumix-lote-aberto.patch
git apply --check /tmp/lumix-lote-aberto.patch
```
Se o `--check` não mostrar nada:
```
git apply /tmp/lumix-lote-aberto.patch
sudo supervisorctl restart backend
```

## Salvar (depois de testar)
```
git add backend/finished_stock.py backend/unit_tests/test_deposit.py frontend/src/components/PendingBatches.js
git commit -m "Contagem parcial de lote aberto aparece para guardar no Estoque/Depósito"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-lote-aberto.patch
sudo supervisorctl restart backend
```
