# Aba Depósito + saída por relatório de vendas (GigaMob)

**Base:** os patches anteriores já aplicados (mínimo em massa, tema escuro/leitor, códigos na lista de gestão).
**Patch:** `updates/lumix-deposito-vendas.patch` (11 arquivos).

## O que muda
- **Estoque → Entrada:** passa a perguntar *"Quantas ficam no Estoque?"*. O restante do lote vai para o **Depósito** (dá para desmarcar). O total nunca passa do que a Contagem registrou. A Contagem em si não muda.
- **Toda saída do Estoque** (manual ou pela Lista de gestão) vira **entrada no Depósito**, com o mesmo lote. Estornar a saída tira do Depósito também.
- **Nova aba Depósito** (Laboratório e Produção): **Só o Depósito** ou **Estoque total** (Estoque + Depósito), filtros, busca, lotes e histórico.
  - **Inventário** (só Laboratório): conta inicial do Depósito, sem limite e com lote opcional.
  - **Saída** (só Laboratório): anexa o PDF do GigaMob e baixa as vendas do Depósito.
- **Saída pelo relatório:**
  - O PDF é lido e **descartado**: o arquivo e os valores em R$ **não ficam guardados**. Só ficam código, nome e quantidade.
  - Todo código que o Lumix ainda não conhece é perguntado (ligar a produto + tamanho, ou ignorar). Depois de ligado, não pergunta mais.
  - **"Só cadastrar os códigos"** liga tudo de uma vez com um relatório grande, sem baixar nada.
  - Conferência com o "Total geral" do PDF, barreira contra baixar o mesmo relatório duas vezes, aviso de período sobreposto, falta de saldo registrada e **desfazer** a importação inteira pelo histórico.
- O Depósito **começa zerado**. Saídas antigas do Estoque não entram.

## Banco de dados
- Nada existente é apagado ou reescrito. Coleções **novas**: `deposit_lots`, `deposit_movements`, `sales_code_map` e `sales_imports`.
- Não há migração nem script para rodar.

## Dependências
Precisa do `pypdf` (leitor de PDF) e do `python-multipart` (receber o arquivo). **Sem o `pypdf` o Lumix continua funcionando normalmente**; só a leitura do PDF avisa *"O leitor de PDF não está instalado"*.

Instale no mesmo Python que roda o backend:
```
cd /app/backend
python -m pip install pypdf==6.16.1 python-multipart==0.0.20
python -c "import pypdf, multipart; print('ok', pypdf.__version__)"
```
Para o Emergent reinstalar sozinho nos próximos deploys, confira se as duas linhas estão no `requirements.txt`; se faltar, acrescente:
```
grep -inE "pypdf|multipart" requirements.txt
echo "pypdf==6.16.1" >> requirements.txt
```
(use o `echo` só para a linha que o `grep` não mostrar)

## Quem acessa
- O **Depósito** (quantidades) vale para quem acessa o Estoque.
- O **PDF e as rotas de vendas** só funcionam para os e-mails do Laboratório (`laboratoriolumix@outlook.com` e `leonicelaboratorio@lumix.com`). O servidor também recusa os demais (erro 403), não só a tela.

## Passo a passo (uma linha por vez)
```
cd /app
git status --short
```
Se aparecerem arquivos dos patches anteriores sem commit, salve-os antes.
```
git branch backup-antes-deposito
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-deposito-vendas.patch > /tmp/lumix-deposito.patch
git apply --check /tmp/lumix-deposito.patch
```
Se o `--check` não mostrar nada:
```
git apply /tmp/lumix-deposito.patch
sudo supervisorctl restart backend
```

## Conferir
1. Menu → Estoque → **Depósito** aparece.
2. Estoque → Entrada → escolha um lote → **"Quantas ficam no Estoque?"** mostra o resumo "X no Estoque + Y no Depósito".
3. Depósito → **Inventário** → lance um produto → ele aparece no card.
4. Depósito → **Saída** → "Só cadastrar os códigos" → anexe o PDF do GigaMob → ligue os produtos.
5. No fim do dia: Saída → anexe o PDF do dia → confira a prévia → **Baixar**.

## Salvar (depois de testar)
```
git add backend/finished_stock.py backend/deposit_sales.py backend/sales_report.py backend/unit_tests/test_finished_stock.py backend/unit_tests/test_deposit.py frontend/src/App.js frontend/src/components/Layout.js frontend/src/components/SalesImportDialog.js frontend/src/context/AuthContext.js frontend/src/pages/Deposito.js frontend/src/pages/Estoque.js
git commit -m "Aba Depósito, entrada dividida e saída por relatório de vendas"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-deposito.patch
sudo supervisorctl restart backend
```
