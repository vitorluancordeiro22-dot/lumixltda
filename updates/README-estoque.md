# Correção de estoque no Emergent

O lote de produto já descontava a receita, mas a ordem de produção fazia uma
segunda baixa diretamente no saldo total. Essa ordem também multiplicava a
quantidade total da receita pela produção, sem dividir pelo rendimento.
Exemplo: 9 kg para uma receita de 200 L devem consumir 4,5 kg num lote de 100 L.

Este pacote foi preparado sobre o código exportado do Emergent em 27/10/2026.
O GitHub e o Emergent têm históricos divergentes; por isso a atualização é um
patch dos quinze arquivos corrigidos. Não é necessário fazer merge, reset ou
substituir a aplicação por uma cópia antiga do GitHub.

A melhoria da tela de pedidos no celular está em um
[complemento separado](README-pedidos-mobile.md), aplicável antes da mesma republicação.

**Se o lote foi bloqueado por “converter Kg para Litros”, aplique somente o
[complemento da regra da receita](README-regra-receita.md).** O pacote completo
abaixo já inclui essa regra para instalações novas.

## Escolha o pacote correto

**Se já aplicou a correção de estoque e a liberação para todos, use somente o
[complemento de contagem física](README-contagem.md).** Não reaplique o pacote
completo sobre esses arquivos já atualizados.

As instruções abaixo são para um ambiente que ainda não recebeu nenhuma das
correções. O pacote completo agora inclui a contagem física.

## Aplicar no terminal do Emergent, em /app

Execute uma linha por vez. Se qualquer uma apresentar erro, pare e confira o
resultado antes de continuar. O teste de aplicação não modifica os arquivos.

```bash
git fetch github
git show github/fix/estoque-emergent-20261027:updates/lumix-stock-fix.patch > /tmp/lumix-stock-fix.patch
git apply --check /tmp/lumix-stock-fix.patch
git apply /tmp/lumix-stock-fix.patch
python -m py_compile backend/stock.py backend/server.py backend/industrial_op_routes.py
```

A branch local `backup-emergent-antes-sync`, criada anteriormente, preserva o
código que estava commitado antes desta atualização. Ela não é um backup do
banco de dados. O patch não contém `.env`, credenciais, dumps, arquivos de
clientes ou comandos de migração.

Depois da aplicação, confira `supervisorctl status` para identificar os serviços
do preview e seu estado. Recarregue os processos do preview conforme a
configuração desse projeto e confira a interface antes de usar Re-publish no
mesmo projeto. Nenhuma publicação é executada por este pacote.

## Liberação de lotes

O pacote também remove a restrição aos dois e-mails antigos na ação **Pronto
para Envase**. Qualquer usuário autenticado pode abrir **Em Produção** e liberar
um lote, inclusive no modo Pedidos. O backend continua exigindo login e registra
`released_by` e `released_for_bottling_at`. Uma atualização condicional preserva
o primeiro responsável em liberações concorrentes. Essa ação muda apenas o
status e os dados da liberação; não faz outra baixa de matéria-prima.

## Comportamento corrigido

- Novo lote de MP soma a quantidade recebida uma vez. Seu saldo restante fica no lote.
- Novo lote de produto baixa a receita proporcional ao rendimento e combina itens repetidos.
- Gramas/mL mantêm as conversões de escala. Quando o rótulo legado do estoque diverge entre massa e volume, a baixa segue a base numérica da receita conforme a regra solicitada pela Lumix; confira os detalhes em [regra da receita](README-regra-receita.md).
- A receita inteira é conferida antes da baixa. Falta de estoque em um ingrediente não deixa os outros parcialmente consumidos.
- Baixas usam atualização condicional de saldo, evitando que requisições concorrentes sobrescrevam o consumo uma da outra.
- Uma ordem de produção vinculada a um lote existente registra o trabalho, sem descontar novamente.
- Uma OP industrial independente faz a baixa proporcional uma vez ao ser criada; mudanças de status não repetem o consumo.
- Alterar a quantidade de um lote ajusta a diferença; repetir a mesma edição não gera novo movimento.
- Cancelar um lote ainda sem envase devolve os consumos rastreados uma vez. Lotes já produzidos devem ser arquivados.
- Restaurar um cancelamento comprovado refaz a baixa. Exclusões antigas sem comprovante de movimentação exigem conferência.
- Excluir/restaurar um lote de MP movimenta apenas seu saldo restante.
- Encerrar manualmente um lote de MP retira a sobra do disponível e registra a quantidade retirada. A tela pede confirmação explícita.
- Receber os lotes de um pedido já recebido é bloqueado, inclusive em chamadas repetidas.
- Editar nome/fornecedor não sobrescreve o estoque com um valor antigo do formulário. Entradas iniciais são registradas como lotes.
- O botão **Conferir Estoque** compara os saldos sem gravar correções automáticas. O endpoint antigo de recálculo também passa a ser somente de leitura.

## Saldos antigos e preservação do banco

Não há tarefa de startup, migração, exclusão de coleções nem troca de conexão.
`MONGO_URL`, `DB_NAME` e `JWT_SECRET` continuam vindo da configuração existente.
O botão **Conferir Estoque** é somente de leitura. O novo botão **Contagem física**
permite informar o saldo realmente contado e revisar as quantidades de cada
lote. Apenas a confirmação explícita grava o ajuste, alinhando o total e o saldo
restante dos lotes e guardando os valores anteriores, motivo, responsável e data.
O saldo que não foi atribuído a lotes existentes fica identificado como ajuste
por contagem, sem inventar fornecedor ou validade. Veja [o fluxo completo](README-contagem.md).

Após republicar, registre a contagem real no site publicado que a equipe usa.
Não registre os valores reais apenas no preview. Não executar os antigos testes
de integração contra uma URL publicada para validar esta atualização.

As movimentações de estoque são serializadas por um bloqueio compartilhado no
MongoDB. A prévia detecta movimentações posteriores e exige outra conferência;
confirmações repetidas usam a mesma chave e não gravam o ajuste duas vezes.
Consumos/exclusões anteriores à contagem não podem devolver saldo antigo sem
conferência. Os dois formatos antigos de rastreabilidade continuam sendo lidos.

O histórico é gravado como pendente com os valores anteriores antes do ajuste.
Falhas observadas tentam restaurar esses valores. Em falha inesperada ou queda
abrupta do processo, o bloqueio pode ficar retido para impedir novos movimentos
até inspecionar a operação e seu histórico. Não há expiração automática que
permita repetir créditos e não se promete transação de múltiplos documentos em
MongoDB standalone. Não limpar bloqueios automaticamente sem conferir o estado.

## Verificação realizada

- 54 testes offline passaram, usando banco em memória e driver substituído antes de importar a aplicação.
- Cobertura: entrada → produção → ordem sem segunda baixa; falta de ingrediente; cancelamento concorrente/repetido; restauração; edições; arquivo; recebimento duplicado; falhas de gravação; unidades; decimais; conferência sem escrita; contagem física com prévia, histórico, saldo por lote, confirmação repetida, falha compensada e bloqueio de devolução antiga; liberação por usuários fora da lista antiga com JWT real, bloqueio sem login e liberação concorrente.
- Build de produção da interface concluído com sucesso.
- O patch foi aplicado em uma cópia limpa da exportação e os quinze arquivos resultantes foram comparados byte a byte.
- Nenhuma consulta ou alteração foi feita no banco real.

Para executar os testes de regressão num ambiente isolado com as dependências
do backend, acrescente `mongomock==4.3.0` e `httpx`, e execute:

```bash
PYTHONPATH=backend python -m unittest discover -s backend/unit_tests -v
```

SHA-256 de `lumix-stock-fix.patch`:

```text
2d8be9eb7de9cf67721f85e120d94fb3a9dfb9729eb28660f2594c468903f7a5
```
