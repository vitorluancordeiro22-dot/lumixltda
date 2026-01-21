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
  - Modo Laboratório: acesso completo
  - Modo Produção: apenas Contagem e Amostras
  - Seleção de modo na tela de login
  - Proteção de rotas por role
- [x] **Logo Lumix na Sidebar** (01/2026)
  - Logo oficial da empresa no cabeçalho da sidebar
- [x] **Botão "Recalcular Litragem Mensal"** (01/2026)
  - Recalcula o total de litros do mês (contagens ativas + arquivadas)
  - Mostra breakdown detalhado no toast
- [x] **Auto-login** - Usuários com sessão ativa são redirecionados automaticamente
- [x] **Edição de Lotes Arquivados** - Apenas para role Laboratório
- [x] **"Destaque do Mês"** - Funcionário que mais envasou
- [x] **Barra de busca na página de Contagem**
- [x] **Cálculo de Litros Corrigido** - Agora separa Litros de Kg nas contagens

### Regras de Negócio
- **Cálculo de Matéria-Prima**: `(receita_quantidade / produto_litros_esperados) * lote_litros_planejados`
- **Formatação de Datas**: Usar helper `formatDateForDisplay` para evitar erros de fuso horário
- **Litragem Mensal**: Soma contagens ativas + arquivadas do mês (apenas Litros, não Kg)
- **Reset Mensal**: Contagens resetam no início de cada mês

## Stack Técnica
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Banco de Dados**: MongoDB

## Arquitetura de Arquivos Principais
```
/app/frontend/src/
├── context/
│   ├── AuthContext.js (RBAC, roles, login)
│   └── MobileContext.js (visualização mobile)
├── components/
│   └── Layout.js (sidebar com logo e filtro por role)
├── pages/
│   ├── Login.js (seleção de modo Laboratório/Produção)
│   ├── Dashboard.js (botões Recalcular e Resetar litros)
│   ├── Counting.js (busca e Destaque do Mês)
│   ├── Samples.js
│   ├── Laudos.js
│   └── ... (demais páginas)
└── App.js (rotas protegidas por RoleRoute)

/app/backend/
└── server.py (endpoints API)
```

## Endpoints Principais
- `GET /api/dashboard/summary` - Resumo com litros do mês (ativas + arquivadas)
- `POST /api/dashboard/recalculate-liters` - Recalcula litragem mensal
- `POST /api/dashboard/reset-liters` - Reseta contador do mês
- `GET /api/counting/top-operator/month` - Funcionário destaque do mês

## Credenciais de Teste
- **Laboratório**: laboratoriolumix@outlook.com / Lumix2002
- **Produção**: teste@teste.com / password

## Backlog (P0/P1/P2)
- [ ] (P0) Confirmação de lote duplicado - Alertar ao criar lote para produto que já tem lote em aberto
- [ ] (P1) Upload de PDF na seção Laudos
- [ ] (P2) Workflow completo de OP Industrial
- [ ] (P2) Atualizar/remover WhatsAppSender.js antigo
