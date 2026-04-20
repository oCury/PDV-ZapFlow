# PDV-ZapFlow

## Visao Geral

Sistema de Ponto de Venda (PDV) voltado para o nicho de moda/confeccao brasileiro. Gerencia catalogo com grade de variantes (tamanho/cor), vendas presenciais e online, pagamentos (Mercado Pago Point Smart, PIX, dinheiro), notas fiscais (NFC-e), mesas/comandas, cashback, follow-up de clientes via WhatsApp (Evolution API) e calculo de frete.

## Stack

- Linguagem: TypeScript
- Framework: Next.js 15 (App Router)
- ORM: Prisma 6 com PostgreSQL (Supabase)
- UI: Tailwind CSS + Lucide Icons (dark theme, brand-green accent)
- Validacao: Zod 4
- PWA: @ducanh2912/next-pwa
- WhatsApp: Evolution API
- Pagamentos: Mercado Pago (Checkout Pro + Point Smart)
- Fiscal: FocusNFe / PlugNotas (NFC-e)

## Convencoes

- Next.js 15: `params` em rotas dinamicas e propriedades de page.tsx sao `Promise<>` (ex: `params: Promise<{ id: string }>`)
- Prisma 6: usar `npx --package=prisma@6 prisma generate` (nao usar prisma global que pode ser v7)
- Prisma db push: precisa de conexao direta ao Supabase (porta 5432), nao funciona via pgbouncer (porta 6543). Trocar temporariamente a DATABASE_URL no .env para a URL direta
- Botoes dentro de `<form>`: sempre usar `type="button"` em botoes que nao devem submeter o formulario
- Variantes de produto: carrinho usa chave composta `productId::variantId` para distinguir SKUs diferentes
- CartItem tem campos opcionais `productId`, `variantId`, `size`, `color` para itens de variante
- Interface simples e intuitiva: pensar no usuario brasileiro medio, linguagem simples e objetiva
- Cores do tema: bg-primary-dark, text-brand-green, hover:bg-brand-green-hover
- Icones com emojis nas categorias para facilitar identificacao visual

## Comandos uteis

```bash
# instalar dependencias
npm install

# dev server
npm run dev

# build (inclui prisma generate)
npm run build

# gerar prisma client
npm run db:generate

# aplicar schema no banco (precisa URL direta, nao pgbouncer)
npm run db:push

# abrir prisma studio
npm run db:studio

# type check
npx tsc --noEmit
```

## Estrutura principal

```
src/
  app/
    api/          # Rotas de API (sales, products, categories, webhooks, etc.)
    pdv/          # Pagina do ponto de venda
    products/     # CRUD de produtos
    categories/   # Gerenciamento de categorias hierarquicas
    customers/    # Clientes e cashback
    sales/        # Historico de vendas
    followups/    # Follow-up via WhatsApp
    tables/       # Mesas e comandas
    settings/     # Configuracoes
    staff/        # Equipe
  components/
    pos/          # Componentes do PDV (grid, cart, pagamento, etc.)
    sidebar.tsx   # Navegacao lateral
    product-modal.tsx
    variant-grid-manager.tsx   # Gerador de grade de variantes
    variant-selector-modal.tsx # Seletor de variante no PDV
    shipping-calculator.tsx    # Calculadora de frete
  hooks/          # Custom hooks (useProducts, useBarcodeScanner, etc.)
  lib/
    validations/  # Schemas Zod (pos.ts, etc.)
prisma/
  schema.prisma   # Schema do banco de dados
```

## Skills ativas

### Desenvolvimento
- `frontend-patterns` — Padroes React/Next.js, componentes, hooks, state, performance
- `frontend-design` — UI de qualidade, design intencional, sistemas visuais
- `backend-patterns` — Arquitetura backend, API, cache, middleware, auth
- `postgres-patterns` — Otimizacao PostgreSQL, indexacao, schema, RLS
- `database-migrations` — Migracoes seguras com Prisma, zero-downtime, rollback
- `api-design` — Convencoes REST, paginacao, filtros, erros, versionamento
- `api-docs-writer` — Documentacao de API clara e completa
- `nestjs-patterns` — Padroes de arquitetura modular (referencia)
- `sql-query-explainer` — Explicar e otimizar queries SQL
- `docker-patterns` — Docker Compose para dev local e deploy
- `deployment-patterns` — Estrategias de deploy (rolling, blue-green, canary)
- `seo` — Auditoria tecnica SEO, Core Web Vitals, structured data

### Qualidade e Seguranca
- `coding-standards` — Convencoes de codigo, naming, imutabilidade, tipos
- `test-driven-development` — TDD: escrever teste antes, red-green-refactor
- `e2e-testing` — Testes E2E com Playwright, Page Object Model
- `systematic-debugging` — Debug sistematico: reproduzir, evidenciar, hipotese, verificar
- `security-review` — Checklist de seguranca: auth, input, secrets, SQL injection, XSS
- `security-scan` — Scan de vulnerabilidades na configuracao
- `security-bounty-hunter` — Caca a vulnerabilidades exploraveis
- `verification-loop` — Verificacao completa: build, tipos, lint, testes, seguranca
- `verification-before-completion` — Confirmar output antes de declarar pronto
- `code-review-checklist` — Checklist de code review por linguagem e risco
- `code-tour` — Criar tours de codigo para onboarding

### Workflow e Agentes
- `writing-plans` — Planos de implementacao com tarefas verificaveis
- `executing-plans` — Executar planos tarefa por tarefa com checkpoints
- `using-superpowers` — Encontrar e usar skills no trabalho
- `dispatching-parallel-agents` — Despachar agentes em paralelo
- `subagent-driven-development` — Dev com subagente por tarefa + review
- `autonomous-loops` — Loops autonomos: sequencial, infinito, RFC-DAG
- `continuous-agent-loop` — Padroes canonicos de loops de agente
- `agentic-engineering` — Engenharia agentica: eval-first, decomposicao, routing
- `finishing-a-development-branch` — Finalizar branch: testes, merge/PR, cleanup
- `using-git-worktrees` — Worktrees isolados para trabalho paralelo
- `github-ops` — Issues, PRs, CI/CD, releases, seguranca no GitHub
- `hookify-rules` — Criar regras de hooks para automacao
- `configure-ecc` — Configurar skills e regras do Claude Code
- `search-first` — Pesquisar ferramentas existentes antes de codar
- `prompt-optimizer` — Otimizar prompts para melhor resultado
- `token-budget-advisor` — Escolha informada de profundidade de resposta
- `ecc-tools-cost-audit` — Auditoria de custo de ferramentas
- `agent-introspection-debugging` — Debug estruturado de falhas de agente
- `ui-demo` — Gravar demos em video com Playwright
- `dashboard-builder` — Construir dashboards de monitoramento

### PM, Produto e Estrategia
- `market-research` — Analise de mercado, diligencia competitiva, due diligence
- `competitive-analysis` — Analise competitiva estruturada com mapa de posicionamento
- `competitive-intelligence-monitor` — Monitoramento continuo de concorrentes
- `competitor-teardown` — Desmontagem completa de concorrente: SWOT, features, messaging
- `competitor-signal-tracker` — Rastrear movimentos de concorrentes por tipo de sinal
- `go-to-market` — Pacote GTM: posicionamento, mensagens, features-beneficios
- `go-to-market-planner` — Plano GTM cross-funcional com metricas e riscos
- `pricing-strategy` — Estrategia de precos: segmentacao, valor, competitivo, pacotes
- `product-health-analysis` — Metricas de produto em narrativa de saude
- `product-capability` — Traduzir intencao de produto em constraints de engenharia
- `feature-prioritisation` — Priorizar features com RICE, MoSCoW, ICE, Kano
- `rice-prioritisation` — Scoring RICE com recomendacoes de sequencia
- `rice-impact-matrix` — RICE + alinhamento estrategico em quadrantes Now/Next/Later
- `retention-analysis` — Diagnosticar churn: curvas de retencao, intervencoes
- `metrics-framework` — Hierarquia de metricas: North Star, arvore, counter-metrics
- `okr-builder` — OKRs ambiciosos e orientados a resultado
- `roadmap-narrative` — Converter iniciativas em narrativa estrategica
- `roadmap-presentation` — Roadmap Now/Next/Later calibrado por audiencia
- `prd-template` — PRD: overview, user stories, requisitos
- `technical-spec-template` — Spec tecnico: arquitetura, trade-offs, rollout
- `sprint-planning` — Planejamento de sprint: goals, capacidade, story points
- `product-launch-checklist` — Checklist pre-lancamento, dia, pos-lancamento
- `launch-readiness` — Avaliacao de prontidao para lancamento go/no-go

### Comunicacao e Stakeholders
- `stakeholder-update` — Updates executivos com BLUF, metricas, riscos
- `executive-summary` — Resumo executivo de 1 pagina com recomendacao
- `executive-update` — Briefing executivo conciso de produto
- `investor-pitch-deck` — Narrativa de pitch deck slide por slide
- `investor-update` — Updates mensais/trimestrais para investidores
- `investor-materials` — Documentos para investidores alinhados
- `investor-outreach` — Emails personalizados para fundraising
- `sales-battlecard` — Battlecard competitivo de 1 pagina
- `brand-voice` — Perfil de voz reutilizavel para consistencia
- `content-calendar` — Calendario de conteudo multi-semana
- `content-engine` — Conteudo nativo por plataforma (X, LinkedIn, TikTok, etc.)
- `press-release` — Press release pronto para distribuicao
- `lead-intelligence` — Pipeline de inteligencia de leads via social graph
- `discovery-call-prep` — Brief de call com pesquisa e perguntas estruturadas
- `discovery-interview-guide` — Guia de entrevista focado em comportamento passado

### Pesquisa e Experimentacao
- `user-research-synthesis` — Sintetizar pesquisa em temas, dores, recomendacoes
- `user-interview-synthesis` — Transformar transcricoes em findings estruturados
- `ab-test-planner` — Design de A/B test com rigor estatistico
- `experiment-designer` — Design e interpretacao de experimentos
- `strategic-narrative-generator` — Narrativa estrategica: o que, por que, por que agora
- `strategic-compact` — Compactacao manual de contexto em workflows longos

## Notas importantes

- O .env contem credenciais reais do Supabase - nunca commitar
- O .env.example tambem tem credenciais reais (precisa ser limpo antes de publicar)
- Categorias sao hierarquicas (parent_id auto-referencia) com sugestoes pre-prontas com emojis
- Produtos podem ter `has_variants=true` com ProductVariant (SKU, tamanho, cor, estoque individual)
- Vendas online usam Mercado Pago Checkout Pro (preferences API) para gerar links de pagamento
- Webhook do Mercado Pago deduz estoque por variante quando `variant_id` esta presente no SaleItem
- Evolution API envia resumos de pedido e mensagens de follow-up via WhatsApp
