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
- [x] **Encerrar Lote na Contagem** (01/2026) - Botão grande para encerrar lote antes de atingir meta
- [x] **Filtro por Produto nos Arquivos** (01/2026) - Ver histórico completo de um produto específico
- [x] **Confirmação de Lote Duplicado** (01/2026) - Alerta ao criar lote para produto com lote em aberto
- [x] **Operador Obrigatório** (01/2026) - Campo obrigatório na contagem
- [x] **Detalhes de Matérias-Primas nos Arquivos** (01/2026) - Mostra MP usadas com lote e validade
- [x] **Menu Simplificado** (01/2026) - Removidas abas "OP Industrial" e "Ordens de Produção"

### Regras de Negócio
- **Cálculo de Matéria-Prima**: `(receita_quantidade / produto_litros_esperados) * lote_litros_planejados`
- **Formatação de Datas**: Usar helper `formatDateForDisplay` para evitar erros de fuso horário
- **Litragem Mensal**: Soma contagens ativas + arquivadas do mês (apenas Litros, não Kg)
- **Reset Mensal**: Contagens resetam no início de cada mês
- **Arquivamento**: Lotes finalizados ou zerados são arquivados automaticamente
- **Operador Obrigatório**: Não é possível registrar contagem sem selecionar operador

## Stack Técnica
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Banco de Dados**: MongoDB

## Endpoints Principais
- `GET /api/health` - Health check para deploy/Kubernetes
- `GET /api/dashboard/summary` - Resumo com litros do mês (ativas + arquivadas)
- `POST /api/dashboard/recalculate-liters` - Recalcula litragem mensal
- `GET /api/dashboard/daily-production` - Dados para gráfico diário
- `GET /api/dashboard/monthly-production` - Dados para gráfico mensal
- `POST /api/product-batches/{batch_id}/finalize` - Finaliza lote de produto
- `POST /api/product-batches/{batch_id}/force-finalize` - Encerra lote forçado
- `PUT /api/product-batches/{batch_id}/release-for-bottling` - Libera para envase
- `POST /api/raw-material-batches/{batch_id}/finalize` - Finaliza lote de MP
- `GET /api/archive/by-product/{product_id}` - Todos os lotes arquivados de um produto
- `PUT /api/archive/reopen/{batch_id}` - Reabre lote arquivado
- `GET /api/product-batches/check-open/{product_id}` - Verifica se há lote em aberto
- `GET /api/archived-batches/product/{product_id}` - Busca lotes arquivados por produto

## Credenciais de Teste
- **Laboratório**: laboratoriolumix@outlook.com / Lumix2002
- **Produção**: teste@teste.com / password
- **Autorizado Em Produção**: luan_ssss@hotmail.com

## Funcionalidades Recentes (01/2026)
- [x] Workflow "Em Produção" com aprovação antes do envase
- [x] Gráficos diários e mensais no Dashboard (recharts)
- [x] Impressão de etiquetas de matérias-primas
- [x] Detalhes de MP nos Arquivos
- [x] Reabrir lote arquivado (implementado, pendente teste E2E)
- [x] Health check `/health` e `/api/health` para deploy
- [x] Impressão de OP fiel ao modelo original (corrigido: layout + nomes de MP em vez de IDs)
- [x] Impressão de Ficha de Análise (segundo botão para controle de qualidade)
- [x] Organização de MP: desconto do lote mais recente, auto-finalização de lotes zerados, recalcular estoque
- [x] Fichas de Análises: aba exclusiva para laboratório, 1 ficha por produto/mês, detalhes de MP com lotes e validades, copiar texto, fechar ficha
- [x] Filtro de etiquetas redesenhado: "Última Leva" (7 dias) como padrão + "Por Mês" como alternativa
- [x] Aba "Ordem de Produção" (renomeada de "Fichas de Análises")
- [x] Nova aba "Ficha de Análise" com 2 sub-abas (Produtos / Matérias-Primas): categorias, campos editáveis por produto, seletor de lote filtrado, registro de análises

## Backlog (P1/P2)
- [ ] (P1) Testar E2E funcionalidade "Reabrir Lote"
- [ ] (P1) Melhorar campo de data de validade nas matérias-primas
- [ ] (P1) Upload de PDF na seção Laudos
- [ ] (P2) Substituir `window.confirm` por `AlertDialog` (Shadcn)
- [ ] (P2) Refatorar `server.py` em routers modulares
- [ ] (P2) Atualizar/remover WhatsAppSender.js antigo
