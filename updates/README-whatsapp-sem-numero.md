# WhatsApp sem caixa de número (aba Produtos)

**Base:** os patches anteriores já aplicados (até `lumix-inventario-acerta-saldo.patch`).
**Patch:** `updates/lumix-whatsapp-sem-numero.patch` (2 arquivos do frontend; não mexe no backend nem no banco).

## O que muda
- **Enviar Lotes WhatsApp:** some a caixa "Número de Telefone".
- **Enviar Último Lote:** some a caixa "Número ou Nome do Grupo". O botão **Abrir WhatsApp** abre o WhatsApp com a mensagem pronta e a pessoa escolhe a conversa ou o grupo lá dentro.

## Passo a passo (uma linha por vez)
```
cd /app
git status --short
git branch backup-antes-whatsapp
git fetch github
git show github/claude/intelligent-cori-30fnm7:updates/lumix-whatsapp-sem-numero.patch > /tmp/lumix-whatsapp.patch
git apply --check /tmp/lumix-whatsapp.patch
```
Se o `--check` não mostrar nada:
```
git apply /tmp/lumix-whatsapp.patch
```
Só frontend: não precisa reiniciar o backend. Atualize a página com F5.

## Salvar (depois de testar)
```
git add frontend/src/components/WhatsAppMultiBatch.js frontend/src/components/WhatsAppSender.js
git commit -m "Remove a caixa de número do WhatsApp na aba Produtos"
git push github HEAD:refs/heads/emergent-producao-20261109
```

## Desfazer (antes do commit)
```
git apply -R /tmp/lumix-whatsapp.patch
```
