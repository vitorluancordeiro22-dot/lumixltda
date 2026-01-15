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

### Regras de Negócio
- **Cálculo de Matéria-Prima**: `(receita_quantidade / produto_litros_esperados) * lote_litros_planejados`
- **Formatação de Datas**: Usar helper `formatDateForDisplay` para evitar erros de fuso horário

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
│   └── Layout.js (sidebar com filtro por role)
├── pages/
│   ├── Login.js (seleção de modo Laboratório/Produção)
│   ├── Counting.js
│   ├── Samples.js
│   ├── Laudos.js
│   └── ... (demais páginas)
└── App.js (rotas protegidas por RoleRoute)

/app/backend/
└── server.py (endpoints API)
```

## Credenciais de Teste
- **Laboratório**: laboratoriolumix@outlook.com / Lumix2002
- **Produção**: teste@teste.com / password

## Backlog (P1/P2)
- [ ] (P0) Barra de busca na página de Contagem
- [ ] (P1) Testar contagem para produtos com unidade "Kg"
- [ ] (P1) Upload de PDF na seção Laudos
- [ ] (P2) Workflow completo de OP Industrial
- [ ] (P2) Atualizar/remover WhatsAppSender.js antigo
