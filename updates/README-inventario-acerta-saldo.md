# Inventário que ACERTA o saldo (em vez de somar como entrada)

**Base:** os patches anteriores já aplicados (até `lumix-lotes-aguardando-destino.patch`).
**Patch:** `updates/lumix-inventario-acerta-saldo.patch` (5 arquivos, sem dependência nova).

## O que muda
- **Inventário do Estoque e do Depósito** agora funcionam assim: você escolhe o produto e o tamanho e **digita o que realmente existe**. O campo já vem com o número do sistema; basta corrigir.
- O sistema calcula a diferença e **acerta o saldo para o número contado**. Antes ele somava como se fosse uma entrada (35 no sistema + 30 contados = 65). Agora: 35 no sistema, contou 30, vira **30**.
- A tela mostra a diferença antes de salvar:
  - **Sobe**: "+20: o saldo vai de 30 para 50" (dá para escolher o lote da diferença; o padrão é "lotes misturados");
  - **Desce**: "−5: sai de Lote 2611004 (5)". Tira primeiro dos lotes misturados e depois do lote mais antigo;
  - **Igual**: "Sem diferença", e nada é registrado.
- O histórico mostra **"35 → 30"** e dá para **estornar** o ajuste (o saldo volta para o número anterior).
- O Inventário **não gasta o limite da Contagem**, **não mexe no outro lado** (o do Estoque não altera o Depósito, e vice-versa) e, se o saldo do Estoque cair abaixo do mínimo, avisa como qualquer saída.
- **Banco:** nada novo. Os ajustes são movimentações do tipo `ajuste` nas coleções que já existem.
- Entradas de "inventário" feitas antes continuam no histórico. Para corrigir um saldo que ficou somado errado, é só contar de novo.

## Passo a passo (uma linha por vez)
```
cd /app
git status --short
```
Se aparecerem arquivos dos patches anteriores sem commit, salve-os antes.
```
git branch backup-antes-inventario
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-inventario-acerta-saldo.patch > /tmp/lumix-inventario.patch
git apply --check /tmp/lumix-inventario.patch
```
Se o `--check` não mostrar nada:
```
git apply /tmp/lumix-inventario.patch
sudo supervisorctl restart backend
```

## Salvar (depois de testar)
```
git add backend/finished_stock.py backend/unit_tests/test_deposit.py frontend/src/pages/Estoque.js frontend/src/pages/Deposito.js
git commit -m "Inventário acerta o saldo em vez de somar como entrada"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-inventario.patch
sudo supervisorctl restart backend
```
