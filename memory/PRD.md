# PRD - Gestão Inteligente de Produção – Lumix

## Descrição do Projeto
Sistema de gestão de produção industrial com controle de lotes, matérias-primas, contagem de produtos, amostras e documentos (laudos).

## Personas
- **Laboratório**: Acesso completo ao sistema (email: laboratoriolumix@outlook.com)
- **Produção**: Acesso restrito a Contagem e Amostras

## Requisitos Principais

### Funcionalidades Implementadas
- [x] Dashboard com visão geral
- [x] Gerenciamento de Produtos (CRUD + duplicação)
- [x] Gerenciamento de Matérias-Primas
- [x] Ordens de Produção
- [x] Contagem de Produtos (com auto-scroll e opções dinâmicas g/Kg ou ml/L)
- [x] Amostras - Rastreamento automático de amostras mensais
- [x] Gerenciamento de Lotes
- [x] Fornecedores
- [x] Laudos - Sistema de pastas aninhadas infinitamente
- [x] Arquivos - Arquivamento automático de lotes finalizados
- [x] Equipe
- [x] Lixeira
- [x] Configurações
- [x] Barras de busca em todas as páginas principais
- [x] Visualização mobile responsiva (botão "Usar no Celular")
- [x] **RBAC - Controle de Acesso por Função** (12/2025)
- [x] **Logo Lumix na Sidebar** (01/2026)
- [x] **Botão "Recalcular Litragem Mensal"** (01/2026)
- [x] **Auto-login** - Usuários com sessão ativa são redirecionados automaticamente
- [x] **Edição de Lotes Arquivados** - Apenas para role Laboratório
- [x] **"Destaque do Mês"** - Funcionário que mais envasou
- [x] **Barra de busca na página de Contagem**
- [x] **Cálculo de Litros Corrigido** - Agora separa Litros de Kg nas contagens
- [x] **Finalizar Lotes de Matérias-Primas** (01/2026) - Botão para finalizar MP zeradas
- [x] **Encerrar Lote na Contagem** (01/2026) - Permite encerrar lote antes de atingir meta, com confirmação
- [x] **Filtro por Produto nos Arquivos** (01/2026) - Ver histórico completo de um produto específico

### Regras de Negócio
- **Cálculo de Matéria-Prima**: `(receita_quantidade / produto_litros_esperados) * lote_litros_planejados`
- **Formatação de Datas**: Usar helper `formatDateForDisplay` para evitar erros de fuso horário
- **Litragem Mensal**: Soma contagens ativas + arquivadas do mês (apenas Litros, não Kg)
- **Reset Mensal**: Contagens resetam no início de cada mês
- **Arquivamento**: Lotes finalizados ou zerados são arquivados automaticamente

## Stack Técnica
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Banco de Dados**: MongoDB

## Endpoints Principais
- `GET /api/dashboard/summary` - Resumo com litros do mês (ativas + arquivadas)
- `POST /api/dashboard/recalculate-liters` - Recalcula litragem mensal
- `POST /api/product-batches/{batch_id}/finalize` - Finaliza lote de produto
- `POST /api/raw-material-batches/{batch_id}/finalize` - Finaliza lote de MP
- `GET /api/archive/by-product/{product_id}` - Todos os lotes arquivados de um produto

## Credenciais de Teste
- **Laboratório**: laboratoriolumix@outlook.com / Lumix2002
- **Produção**: teste@teste.com / password

## Backlog (P0/P1/P2)
- [ ] (P0) Confirmação de lote duplicado - Alertar ao criar lote para produto que já tem lote em aberto
- [ ] (P1) Upload de PDF na seção Laudos
- [ ] (P2) Workflow completo de OP Industrial
- [ ] (P2) Atualizar/remover WhatsAppSender.js antigo
