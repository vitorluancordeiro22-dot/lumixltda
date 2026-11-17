# Lotes aguardando destino + "Tudo para o Depósito"

**Base:** o patch `lumix-deposito-vendas.patch` já aplicado.
**Patch:** `updates/lumix-lotes-aguardando-destino.patch` (6 arquivos, sem dependência nova).

## O problema que resolve
A divisão Estoque/Depósito só acontecia quando alguém registrava a parte do **Estoque**. Se o lote inteiro ia ficar no Depósito, ninguém abria a Entrada e o sistema não sabia onde as garrafas estavam.

## O que muda
- **Estoque → Entrada:** botão **"Tudo para o Depósito"** ao lado de "Quantas ficam no Estoque?" (deixa 0 no Estoque e manda o lote todo).
- **Painel "Lotes aguardando destino"** no topo das abas **Estoque** e **Depósito**: lista todo lote **finalizado** (dos últimos 30 dias) cujas garrafas contadas ainda não foram nem pro Estoque nem pro Depósito. Em cada linha:
  - **Tudo para o Depósito** (um toque, com confirmação; dá para estornar na aba Depósito);
  - **Dividir** (só no Estoque): abre a Entrada já no lote;
  - **Olho riscado**: tira da lista sem mexer em saldo (ex.: já entrou no Inventário).
- O painel some sozinho quando não resta nada. Lotes ainda em contagem não aparecem.
- A Contagem não é alterada. Nada muda de saldo sem alguém tocar num botão.
- **Banco:** uma coleção nova, `pending_dismissed`. Nada existente é alterado.

## Passo a passo (uma linha por vez)
```
cd /app
git status --short
```
Se aparecerem arquivos dos patches anteriores sem commit, salve-os antes.
```
git branch backup-antes-aguardando
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-lotes-aguardando-destino.patch > /tmp/lumix-aguardando.patch
git apply --check /tmp/lumix-aguardando.patch
```
Se o `--check` não mostrar nada:
```
git apply /tmp/lumix-aguardando.patch
sudo supervisorctl restart backend
```

## Salvar (depois de testar)
```
git add backend/finished_stock.py backend/unit_tests/test_deposit.py frontend/src/components/PendingBatches.js frontend/src/pages/Estoque.js frontend/src/pages/Deposito.js
git commit -m "Lotes aguardando destino e botão Tudo para o Depósito"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-aguardando.patch
sudo supervisorctl restart backend
```
