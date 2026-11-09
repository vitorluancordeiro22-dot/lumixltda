# Códigos de barras na Lista de gestão

**Base:** os patches `lumix-estoque-minimo-em-massa.patch` e `lumix-tema-escuro-leitor-minimo.patch` já aplicados.
**Patch:** `updates/lumix-codigos-lista-gestao.patch` (4 arquivos, sem dependência nova, sem mudança no banco).

## O que muda
- Na lista impressa, cada item ganha a coluna **Código**, com o código de barras do produto e tamanho. É o código cadastrado em Configurações ou, se não houver, um código interno `LX…` que o Lumix reconhece.
- No topo da folha vai o **código da lista** (`LS…`). Lido pela câmera ou pelo leitor na aba Estoque, ele abre a confirmação de saída daquela lista.

## Passo a passo (uma linha por vez)
```
cd /app
git branch backup-antes-codigos-lista
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-codigos-lista-gestao.patch > /tmp/lumix-codigos.patch
git apply --check /tmp/lumix-codigos.patch
git apply /tmp/lumix-codigos.patch
sudo supervisorctl restart backend
```

## Salvar (depois de testar)
```
git add backend/finished_stock.py backend/unit_tests/test_finished_stock.py frontend/src/lib/code128.js frontend/src/pages/Estoque.js
git commit -m "Códigos de barras na lista de gestão"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-codigos.patch
sudo supervisorctl restart backend
```
