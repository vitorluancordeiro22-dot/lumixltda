# Estoque de produto acabado — como aplicar no Emergent

**Base:** commit `559e40a` (estado de produção salvo em 09/11/2026, branch `emergent-producao-20261109`).
**Patch:** `updates/lumix-estoque-produto-acabado.patch`, com 14 arquivos (6 já existentes alterados, 8 novos) e 1816 linhas adicionadas.

## O que muda

| Onde | O quê |
|---|---|
| Menu → ESTOQUE → **Estoque** | Aba nova (Laboratório e Produção) |
| Produtos → Editar | Seção "Estoque — tamanhos e quantidade mínima" |
| Configurações | Card "Códigos de barras" → **Registrar códigos** |
| Backend | `backend/finished_stock.py` (novo) e 6 linhas em `server.py` |

## Banco de dados

- Nada existente é apagado ou reescrito.
- Coleções **novas**: `finished_stock_lots`, `finished_stock_movements`, `finished_stock_lists`, `finished_stock_locks` e `product_barcodes`.
- Em `products` entram só dois campos **opcionais** (`stock_sizes`, `stock_minimums`), gravados quando você salva um produto.
- Não há migração nem script para rodar.
- Não precisa instalar nenhuma dependência nova. O leitor de câmera é carregado pelo navegador quando a câmera é aberta.

## Passo a passo no terminal do Emergent

```
cd /app
git status --short --branch
git log -1 --oneline
```
O último comando precisa mostrar `559e40a Salva estado de produção...`. Se aparecer outra coisa, pare e me avise.

Crie um ponto de recuperação:
```
git branch backup-antes-estoque
```

Baixe e confira o patch:
```
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-estoque-produto-acabado.patch > /tmp/lumix-estoque.patch
git apply --check /tmp/lumix-estoque.patch
```

Só se o `--check` não mostrar nenhum erro:
```
git apply /tmp/lumix-estoque.patch
git --no-pager diff --stat
```

Reinicie o backend (o frontend recarrega sozinho):
```
sudo supervisorctl restart backend
```

## Conferir

1. A aba **Estoque** aparece no menu.
2. Em **Produtos → Editar**, marque os tamanhos e o mínimo de um produto e salve.
3. Em **Estoque → Inventário**, lance a contagem manual inicial. O lote é opcional e o diálogo continua aberto para o próximo produto.
4. Faça uma **Saída** que deixe o saldo no mínimo. Deve aparecer o aviso e a notificação em **Notificar**.

Se estiver tudo certo, salve:
```
git add -A backend/finished_stock.py backend/unit_tests/test_finished_stock.py backend/server.py frontend/src
git commit -m "Estoque de produto acabado: aba Estoque, códigos de barras e mínimos"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-estoque.patch
sudo supervisorctl restart backend
```

## Regras de uso
- **Entrada:** escolhe o lote (inclusive os arquivados). O limite é o que a Contagem registrou daquele tamanho, menos o que já entrou.
- **Inventário** (só Laboratório): sem limite e lote opcional ("lotes misturados"). Não consome o limite da Contagem.
- **Saída:** tira primeiro dos lotes misturados e depois do lote mais antigo. Com vários itens, ou sai tudo ou não sai nada.
- **Notificação:** quando o saldo de um tamanho chega no mínimo ou abaixo dele, cria o aviso em Notificar e manda push para todos.
- **Lista de gestão:** monte, imprima e, depois da baldeação, use **Confirmar saída** para dar baixa em tudo de uma vez.
- **Estorno** (só Laboratório): desfaz uma movimentação. Uma entrada só pode ser estornada se as unidades ainda estiverem no estoque.
