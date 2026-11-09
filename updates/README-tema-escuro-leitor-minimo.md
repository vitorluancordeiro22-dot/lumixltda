# Tema escuro, leitor de código de barras e garrafinhas no mínimo em massa

**Base:** `ccb0159` **com** o patch `lumix-estoque-minimo-em-massa.patch` já aplicado (commitado ou não).
**Patch:** `updates/lumix-tema-escuro-leitor-minimo.patch` (10 arquivos).

## O que muda
- **Estoque mínimo → Aplicar a vários:** você toca nas garrafinhas (ex.: 2L e 5L) e só elas mostram o campo do mínimo. Tem a opção "Esses produtos só têm estes tamanhos".
- **Leitor de código de barras:** usa o leitor nativo do celular (Android/Chrome) ou o ZXing (iPhone e outros). Tem foco contínuo, lanterna e uma linha de mira.
- **Tema escuro:** o verde Lumix volta no lugar do azul, e menu, topo, cards, avisos e gráficos ficam escuros de verdade. Configurações ganha a escolha **Claro / Escuro / Automático**.
- O tema claro não muda.
- **Dependência nova:** `@zxing/library` 0.21.3 no frontend.
- **Banco:** nada novo.

## Passo a passo (uma linha por vez)
Primeiro, salve o patch anterior, se ainda não salvou:
```
cd /app
git status --short
```
Se aparecerem os arquivos do mínimo em massa (`MinimumsManager.js` e outros), faça o commit deles primeiro:
```
git add backend/finished_stock.py backend/unit_tests/test_finished_stock.py frontend/src/components/MinimumsManager.js frontend/src/pages/Estoque.js
git commit -m "Estoque mínimo em massa: aplicar a vários e tabela"
```

Depois:
```
git branch backup-antes-tema-escuro
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-tema-escuro-leitor-minimo.patch > /tmp/lumix-tema.patch
git apply --check /tmp/lumix-tema.patch
```
Se o `--check` não mostrar nada:
```
git apply /tmp/lumix-tema.patch
cd /app/frontend && yarn install && cd /app
sudo supervisorctl restart backend frontend
```

## Salvar (depois de testar)
```
git add backend/finished_stock.py backend/unit_tests/test_finished_stock.py frontend/package.json frontend/yarn.lock frontend/public/index.html frontend/src/components/BarcodeScanner.js frontend/src/components/MinimumsManager.js frontend/src/context/ThemeContext.js frontend/src/index.css frontend/src/pages/Estoque.js frontend/src/pages/Settings.js
git commit -m "Tema escuro completo, leitor de código de barras e mínimo em massa com garrafinhas"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-tema.patch
git checkout frontend/yarn.lock
sudo supervisorctl restart backend frontend
```
