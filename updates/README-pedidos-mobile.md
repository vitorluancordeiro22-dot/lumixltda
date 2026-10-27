# Pedidos no celular

Complemento preparado sobre a tela de pedidos exportada do Emergent em
27/10/2026. Pode ser aplicado antes ou depois do complemento de contagem física:
este patch altera somente quatro arquivos do frontend e não altera o backend,
as permissões, o banco ou as regras de recebimento de matérias-primas.

## Aplicar no Emergent

No terminal do projeto, em `/app`, execute **uma linha por vez**. Se alguma
apresentar erro, pare nessa linha. Não use `git pull`, reset ou substituição pela
versão antiga do GitHub. Não reaplique o patch se ele já tiver sido aplicado.

```bash
git fetch github
git show github/fix/estoque-emergent-20261027:updates/lumix-pedidos-mobile.patch > /tmp/lumix-pedidos-mobile.patch
git apply --check /tmp/lumix-pedidos-mobile.patch
git apply /tmp/lumix-pedidos-mobile.patch
supervisorctl restart frontend
supervisorctl status
```

O `--check` não muda arquivos; o `git apply` aplica o código. Nenhuma dessas
etapas cria pedidos, recebe mercadoria ou ajusta estoque. Não há dependências
novas para instalar. O reinício acima é apenas do frontend do preview.

Confira **Pedidos → Novo pedido** no preview, preferencialmente pelo celular.
Depois use **Re-publish no mesmo projeto** para levar a interface ao site que a
equipe utiliza. Se também estiver aplicando o complemento de contagem física,
pode aplicar os dois e fazer uma única republicação após conferir o preview.
Mantenha a conexão com o banco já existente.

## O que muda

- Novo pedido ocupa a tela inteira no celular e uma janela maior no computador.
  O conteúdo tem uma única rolagem, com cabeçalho e ações sempre acessíveis.
- Fornecedor → Itens → Revisão: os nomes aparecem completos, os campos usam
  tamanho adequado ao toque e o rodapé mostra a quantidade de itens incluídos.
- Busca de fornecedores, de materiais no catálogo e de pedidos no histórico.
  A busca ignora diferenças entre maiúsculas/minúsculas e acentos.
- Quantidades aceitam vírgula ou ponto decimal: **1,5 vira 1.5 no envio**.
  Digite sem separador de milhar: para mil e quinhentos, informe `1500`.
  Valores vazios, zero, negativos, infinitos ou texto inválido impedem o envio;
  itens inválidos não são descartados silenciosamente.
- Ao digitar a quantidade no catálogo, toque em **Adicionar**. Se o item já
  estiver no pedido, **Atualizar** substitui a quantidade daquele item. Campos
  ainda não incluídos precisam ser adicionados ou limpos antes da revisão.
- Itens avulsos continuam disponíveis. Entram com quantidade 1, ajustável na
  revisão. A unidade continua sendo uma escolha única para todos os itens,
  conforme o comportamento existente no backend.
- Na revisão, é possível corrigir quantidades e remover itens, com a lixeira
  sempre visível. Observações aparecem antes de **Criar pedido**.
- Trocar para outro fornecedor pede confirmação e limpa os itens e observações
  somente se a pessoa confirmar, evitando levar materiais do fornecedor anterior.
- O rascunho é salvo automaticamente **neste navegador e por conta**. Fechar a
  tela ou atualizar a página permite continuar; não sincroniza entre aparelhos.
  O menu de três pontos oferece **Salvar e sair** e **Descartar rascunho**.
  Descartar exige confirmação. A criação bem-sucedida limpa o rascunho.
- O histórico mostra cartões mais simples, com todos os itens acessíveis.
  PDF, marcar enviado/recebido, reabrir, **Lotear MP** e excluir ficam no menu
  de três pontos do pedido. Compartilhar continua acessível no cartão.

## Conferência

Os testes usam dados fictícios e APIs simuladas; o banco da Lumix não foi
acessado. Foram executados 23 testes de quantidades, rascunho e payload e a
compilação de produção do frontend. O fluxo também foi exercitado em Chromium
com larguras de 320, 390 e 1280 px, incluindo altura reduzida de 400 px, fechamento
e recarga do rascunho, revisão, troca de fornecedor e confirmação do pedido.
Altura reduzida não substitui a conferência do teclado real em Safari/Android.

Criar um pedido continua apenas registrando a compra. A entrada de mercadorias
permanece na ação **Lotear MP**, com as proteções de estoque aplicadas à parte.
Se a rede cair durante a criação e a resposta ficar incerta, confira o histórico
antes de tentar novamente; este complemento não adiciona idempotência no servidor.

As correções anteriores ficam em [estoque](README-estoque.md) e
[contagem física](README-contagem.md). Este complemento é separado e não está
embutido no patch completo de estoque.

SHA-256 do patch: `a1abb687b121726de3ff16933d9eb1001413d8ac7e98da4cbb570fb8f696c04e`.
