# Baixa proporcional pela receita

Este complemento remove o bloqueio que impedia criar um lote quando a receita
usava Kg e o cadastro antigo da matéria-prima estava rotulado em Litros (ou o
inverso). A regra operacional solicitada pela Lumix é:

**consumo = quantidade do ingrediente na receita × produção planejada ÷ rendimento da receita**

O produto final pode ser em litros e seus ingredientes em kg. A unidade final
do produto não exige converter a massa dos ingredientes em volume.

## Aplicar no Emergent

Para quem já aplicou a correção de estoque anterior, execute **uma linha por
vez** no terminal do projeto em `/app`. Se alguma apresentar erro, pare nela.

```bash
git fetch github
git show github/fix/estoque-emergent-20261027:updates/lumix-recipe-rule.patch > /tmp/lumix-recipe-rule.patch
git apply --check /tmp/lumix-recipe-rule.patch
git apply /tmp/lumix-recipe-rule.patch
python -m py_compile backend/stock.py
supervisorctl restart backend
supervisorctl status
```

Confira a prévia e faça **Re-publish no mesmo projeto** para atualizar o site
que a equipe utiliza. O patch altera `backend/stock.py` e seus testes. Não há
nova dependência, comando de migração, troca de banco, reset de estoque ou
mudança automática das receitas/cadastros. O MongoDB não é reiniciado.

O complemento pode ser aplicado com ou sem a contagem física já instalada e
independe do complemento de pedidos mobile. Se já aplicou o pacote completo de
estoque atualizado que contém esta regra, não reaplique este complemento.

## Exemplo da receita enviada

Para **Limpador Perfumado Flor de Ameixa**, a receita rende 150 litros:

| Ingrediente | Receita de 150 L | Produzir 300 L |
|---|---:|---:|
| Conservante RN-BIO | 0,3 kg | 0,6 kg |
| Brancol Syntecril | 0,25 kg | 0,5 kg |
| Essência Flor de Ameixa | 0,3 kg | 0,6 kg |
| Renex | 0,3 kg | 0,6 kg |
| Água | 148 kg | 296 kg |

Meia receita consome metade; duas receitas consomem o dobro. A ordem de produção
continua documentando o lote sem uma segunda baixa. A alteração do tamanho do
lote movimenta somente a diferença, e o cancelamento devolve o consumo registrado.

## Unidades e saldos legados

Quando receita e estoque têm unidades compatíveis, seguem as conversões de
escala existentes (por exemplo, 500 g = 0,5 kg; 250 ml = 0,25 L).

Quando o rótulo legado do estoque conflita entre massa e volume, **a receita
passa a definir a base numérica da baixa**, em kg ou litros. O saldo disponível
já registrado é interpretado nessa base operacional. Assim, receita de 0,3 kg
consome 0,6 do saldo numérico ao dobrar a produção, mesmo que o rótulo antigo
seja Litros. O cadastro não é reescrito. O movimento guarda a unidade utilizada,
o rótulo antigo e `stock_quantity_basis: recipe` para rastreabilidade.

Isso implementa a convenção solicitada para os saldos legados da Lumix; não é
uma conversão física por densidade. Se um saldo tiver sido realmente medido em
outra grandeza, é necessário conferir sua quantidade física nessa base antes
de confiar na reconciliação. A regra não recupera automaticamente erros antigos.

Continuam obrigatórios: receita com rendimento positivo, quantidade finita,
matéria-prima vinculada/existente e saldo suficiente nos lotes. Linhas repetidas
da mesma matéria-prima precisam usar unidades compatíveis entre si.

## Verificação

**54 testes offline passaram**, sem acessar o banco real. A receita do print foi
reproduzida com cinco ingredientes em Kg e cadastros fictícios rotulados como
Litros. O teste confirmou as cinco baixas em dobro, ausência de segunda baixa
pela ordem, devolução correta no cancelamento e edição por diferença.

SHA-256 do complemento: `0d090a316309eb5be1ff00d02fe2760b658597093037370cc6d40244239ef9ce`.
