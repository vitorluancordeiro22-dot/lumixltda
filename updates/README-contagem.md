# Complemento: contagem física do estoque

Use este complemento **se a correção de estoque e a liberação de lotes para
todos os usuários logados já foram aplicadas**. Ele acrescenta o ajuste inicial
que permite trocar um saldo histórico incorreto, como 4.000 kg, pelo saldo
contado fisicamente. Não é um novo recebimento somado ao saldo antigo.

## Atualizar o código no Emergent

No terminal do VS Code do projeto, em `/app`, execute uma linha por vez. Se
houver erro, pare e confira a mensagem antes de continuar.

```bash
git fetch github
git show github/fix/estoque-emergent-20261027:updates/lumix-physical-count.patch > /tmp/lumix-physical-count.patch
git apply --check /tmp/lumix-physical-count.patch
git apply /tmp/lumix-physical-count.patch
python -m py_compile backend/stock.py backend/stock_control.py backend/stock_counts.py backend/server.py backend/industrial_op_routes.py
supervisorctl restart backend frontend
supervisorctl status
```

Não há dependência nova para instalar no aplicativo. O comando reinicia os
serviços do preview do projeto; não reinicia o MongoDB. A aplicação do patch e
a inicialização dos processos não ajustam saldos automaticamente.

Confira a nova interface no preview. Depois use **Re-publish no mesmo projeto**.
Registre a contagem real **no site publicado que a equipe utiliza**, após essa
republicação, mantendo as configurações de conexão e o banco existentes.

## Registrar os saldos contados

1. No modo Laboratório, abra **Matérias-Primas → Contagem física**.
2. Selecione uma matéria-prima e informe o saldo disponível na unidade mostrada.
   Se contou 100 kg, informe **100**, mesmo que o saldo antigo seja 4.000 kg.
3. Informe o motivo e clique em **Conferir ajuste**. Até aqui nenhuma quantidade
   é gravada. Combine uma pausa nos lançamentos enquanto faz a contagem física.
4. Compare o saldo cadastrado, o saldo nos lotes e o saldo após confirmar.
   Revise as quantidades por lote e ajuste-as conforme a contagem real. A
   sugestão reduz primeiro os lotes mais recentes, mas pode ser alterada.
5. O saldo não atribuído a lotes existentes será identificado num lote de ajuste
   por contagem, sem fornecedor/validade atribuídos. Não é registrado como compra.
6. Marque a confirmação e clique em **Confirmar contagem física**. O sistema
   alinha total e lotes, mantendo os cadastros e o histórico anterior.
7. Confira o histórico exibido e selecione a próxima matéria-prima.

O histórico guarda saldo anterior e contado, quantidades por lote, motivo,
responsável e data. A liberação de lotes continua disponível para todos os
usuários autenticados; confirmar contagem física segue o acesso de Laboratório
da tela de matérias-primas.

Exemplo testado: contagem de **100 kg**, novo recebimento de **50 kg**, lote de
produto que consome **9 kg**: saldo final **141 kg**. Receitas e unidades devem
corresponder ao que é realmente usado; uma contagem aproximada estabelece uma
base aproximada.

## Conferências e recuperação

- Uma movimentação desde a prévia invalida a confirmação; confira novamente o
  saldo físico e gere outra prévia. A tela limpa o valor antigo nesse caso.
- Repetir a mesma confirmação após uma falha de rede não duplica o ajuste.
- Excluir/restaurar registros antigos que devolveriam matéria-prima anterior
  à contagem exige conferência, para não inflar a nova base.
- Durante um ajuste, as outras movimentações de estoque aguardam nova tentativa.
  O bloqueio compartilhado funciona entre processos sem exigir replica set.
- O histórico pendente guarda os valores anteriores antes de alterar lotes e
  total. Uma falha observada tenta compensar as gravações. Em erro inesperado ou
  queda do processo, o bloqueio permanece até conferir o histórico e os saldos;
  não limpar bloqueios nem repetir créditos sem essa inspeção.

Validação: **50 testes offline** passaram, incluindo conferência sem escrita,
alinhamento de saldo e lotes, saldo zero, estoque sem lotes, distribuição
editável, confirmação repetida, prévia desatualizada, autorização, falha de
gravação compensada, devoluções anteriores à contagem, numeração e movimentos
posteriores. O build de produção da interface passou. Os pacotes completo e
incremental foram aplicados a cópias limpas de suas respectivas bases e os
arquivos comparados byte a byte. Nenhum banco real foi acessado para preparar
ou testar a atualização.

SHA-256 do complemento:

```text
95ffa0fd628c6de984e30fb527892cfb6208a223688b526faadb2b181aeaf0e9
```
