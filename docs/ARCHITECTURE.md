# PDV-ZapFlow - Documentacao Completa de Arquitetura

## Indice

1. [Visao Geral](#visao-geral)
2. [Stack Tecnologica](#stack-tecnologica)
3. [Estrutura do Projeto](#estrutura-do-projeto)
4. [Modelos de Dados](#modelos-de-dados)
5. [API Endpoints](#api-endpoints)
6. [Paginas e Navegacao](#paginas-e-navegacao)
7. [Componentes](#componentes)
8. [Hooks Customizados](#hooks-customizados)
9. [Servicos e Bibliotecas](#servicos-e-bibliotecas)
10. [Fluxos de Negocio](#fluxos-de-negocio)
11. [Integracoes Externas](#integracoes-externas)
12. [PWA e Offline](#pwa-e-offline)
13. [Seguranca e Autenticacao](#seguranca-e-autenticacao)
14. [Configuracao e Deploy](#configuracao-e-deploy)
15. [Decisoes Arquiteturais](#decisoes-arquiteturais)

---

## Visao Geral

PDV-ZapFlow e um sistema de Ponto de Venda (PDV) completo voltado para o nicho de **moda e confeccao brasileiro**. Gerencia:

- Catalogo com grade de variantes (tamanho/cor/modelo)
- Vendas presenciais e online (multicanal: PDV, Online, WhatsApp)
- Pagamentos multiplos (Mercado Pago Point Smart, PIX, dinheiro, cartao, fidelidade, voucher)
- Notas fiscais eletronicas (NFC-e) com contingencia
- Mesas e comandas para atendimento
- Cashback e programa de fidelidade
- Follow-up automatico de clientes via WhatsApp (Evolution API)
- Trocas e devolucoes com vouchers
- Comissoes por vendedor (fixa, por categoria, escalonada)
- Relatorios gerenciais (curva ABC, margem, giro, comparativo)
- Calculo de frete
- Impressao de etiquetas
- Modo offline (PWA + IndexedDB)

---

## Stack Tecnologica

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Linguagem | TypeScript | 5.7+ |
| Framework | Next.js (App Router) | 15.2+ |
| ORM | Prisma | 6.19+ |
| Banco de Dados | PostgreSQL (Supabase) | - |
| UI Framework | Tailwind CSS | 4.0+ |
| Icones | Lucide React | 0.474+ |
| Validacao | Zod | 4.3+ |
| PWA | @ducanh2912/next-pwa | 10.2+ |
| Graficos | Recharts | 3.7+ |
| PDF/Labels | jsPDF + JsBarcode | - |
| Offline DB | Dexie (IndexedDB) | 4.3+ |
| Testes E2E | Playwright | 1.59+ |
| WhatsApp | Evolution API | - |
| Pagamentos | Mercado Pago (REST API) | - |
| Fiscal | FocusNFe / PlugNotas | - |

### Dependencias-chave

```json
{
  "@ducanh2912/next-pwa": "PWA com Workbox",
  "@prisma/client": "ORM type-safe",
  "dexie": "IndexedDB wrapper para offline",
  "jsbarcode": "Geracao de codigo de barras para etiquetas",
  "jspdf": "Geracao de PDF para etiquetas",
  "lucide-react": "Icones SVG",
  "next-themes": "Suporte a dark/light theme",
  "recharts": "Graficos no dashboard",
  "zod": "Validacao de schemas em runtime"
}
```

---

## Estrutura do Projeto

```
PDV-ZapFlow/
├── prisma/
│   └── schema.prisma          # Schema completo do banco de dados
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service Worker (Workbox)
│   └── icons/                 # Icones PWA (192x192, 512x512)
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout (providers, theme, font)
│   │   ├── page.tsx           # Dashboard principal
│   │   ├── login/             # Autenticacao
│   │   ├── pdv/               # Ponto de Venda (tela principal)
│   │   ├── products/          # CRUD de produtos
│   │   ├── categories/        # Categorias hierarquicas
│   │   ├── customers/         # CRM e fidelidade
│   │   ├── sales/             # Historico de vendas
│   │   ├── tables/            # Mesas e comandas
│   │   ├── exchanges/         # Trocas e devolucoes
│   │   ├── vouchers/          # Vales e gift cards
│   │   ├── fiscal/            # Gestao NFC-e
│   │   ├── commissions/       # Comissoes
│   │   ├── reports/           # Relatorios gerenciais
│   │   ├── followups/         # Follow-up WhatsApp
│   │   ├── labels/            # Impressao de etiquetas
│   │   ├── staff/             # Gestao de equipe
│   │   ├── settings/          # Configuracoes da loja
│   │   └── api/               # API Routes (ver secao dedicada)
│   ├── components/
│   │   ├── pos/               # Componentes do PDV
│   │   ├── exchanges/         # Componentes de trocas
│   │   ├── fiscal/            # Componentes fiscais
│   │   ├── reports/           # Componentes de relatorios
│   │   ├── sidebar.tsx        # Navegacao lateral
│   │   ├── product-modal.tsx  # Modal de produto
│   │   └── ...                # Componentes compartilhados
│   ├── hooks/
│   │   ├── useProducts.ts     # Fetch de produtos com variantes
│   │   ├── useBarcodeScanner.ts # Leitor de codigo de barras
│   │   └── useOfflineSync.ts  # Sincronizacao offline
│   └── lib/
│       ├── prisma.ts          # Singleton do Prisma Client
│       ├── auth.ts            # Autenticacao (session, hash)
│       ├── fiscal/            # Servico NFC-e
│       ├── commissions/       # Calculo de comissoes
│       ├── exchanges/         # Processamento de trocas
│       ├── vouchers/          # Servico de vouchers
│       ├── reports/           # Logica de relatorios
│       ├── labels/            # Geracao de etiquetas
│       ├── whatsapp/          # Evolution API client
│       ├── shipping/          # Calculo de frete
│       └── validations/       # Schemas Zod
├── CLAUDE.md                  # Instrucoes para AI assistants
├── package.json
├── tsconfig.json
└── next.config.js
```

---

## Modelos de Dados

### Diagrama de Relacionamentos

```
User ─────────┬── CashRegisterShift
              ├── CommissionRule ──── CommissionCategoryRule
              │                 └─── CommissionTier
              ├── SalesGoal
              ├── Sale (as seller)
              └── Exchange (as processor)

Category ─────┬── Product
(self-ref)    └── CommissionCategoryRule

Product ──────┬── ProductVariant
              └── SaleItem

Customer ─────┬── Sale
              ├── CustomerFollowup
              └── Voucher

Table ────────── Sale

Sale ─────────┬── SaleItem ──── ExchangeItem
              ├── SalePayment
              ├── CustomerFollowup
              ├── FiscalQueue
              ├── FiscalEvent
              ├── Exchange
              └── VoucherUsage

Exchange ─────┬── ExchangeItem
              └── Voucher

Voucher ──────── VoucherUsage
```

### Detalhamento dos Modelos

#### User (users)
Funcionarios e administradores do sistema.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | String (cuid) | PK |
| name | String | Nome completo |
| email | String (unique) | Login |
| password | String | Hash scrypt |
| role | UserRole | ADMIN ou EMPLOYEE |
| active | Boolean | Se pode acessar o sistema |

**Roles:**
- `ADMIN`: Acesso total (produtos, relatorios, configuracoes, fiscal)
- `EMPLOYEE`: Acesso restrito (PDV, vendas, mesas)

#### Category (categories)
Categorias hierarquicas de produtos com auto-referencia.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | String (cuid) | PK |
| name | String | Nome da categoria (com emoji) |
| slug | String (unique) | URL-friendly |
| parent_id | String? | FK para categoria pai |
| image_url | String? | Imagem da categoria |
| sort_order | Int | Ordem de exibicao |
| active | Boolean | Visibilidade |

**Exemplos:** "👗 Vestidos", "👖 Calcas > Jeans", "👟 Calcados > Tenis"

#### Product (products)
Produto base que pode ter variantes.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | String (cuid) | PK |
| name | String | Nome do produto |
| barcode | String (unique) | Codigo de barras EAN |
| cost_price | Decimal(10,2) | Preco de custo |
| sell_price | Decimal(10,2) | Preco de venda |
| stock_quantity | Int | Estoque (se sem variantes) |
| min_stock | Int | Alerta de estoque minimo |
| category | String | Categoria legada (texto) |
| category_id | String? | FK para Category |
| has_variants | Boolean | Se usa grade de variantes |
| ncm | String? | NCM 8 digitos (fiscal) |
| cfop | String? | CFOP (default: 5102) |
| fiscal_unit | String? | Unidade (default: UN) |

**Regra:** Se `has_variants=true`, estoque e gerenciado por `ProductVariant`, nao pelo campo `stock_quantity`.

#### ProductVariant (product_variants)
SKU individual com tamanho/cor/modelo.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | String (cuid) | PK |
| product_id | String | FK para Product |
| sku | String (unique) | Codigo SKU unico |
| size | String | Tamanho (P, M, G, GG, 36, 38...) |
| color | String? | Cor ou estampa |
| model | String? | Modelo especifico |
| barcode | String? (unique) | Codigo de barras individual |
| stock_quantity | Int | Estoque desta variante |
| min_stock | Int | Alerta minimo |
| cost_price | Decimal? | Override de custo |
| sell_price | Decimal? | Override de preco |
| active | Boolean | Se disponivel para venda |

**Geracao de SKU:** `{barcode_produto}-{size}-{color}` (automatico)

#### Customer (customers)
Cliente com dados para CRM e fidelidade.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | String (cuid) | PK |
| name | String? | Nome |
| email | String? (unique) | Email |
| phone | String (unique) | Telefone principal |
| whatsapp | String? | WhatsApp (se diferente) |
| cpf | String? (unique) | CPF brasileiro |
| loyalty_points | Int | Pontos (1 BRL = 1 ponto) |

#### Table (tables)
Mesas para atendimento presencial.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | String (cuid) | PK |
| number | Int (unique) | Numero da mesa |
| name | String? | Nome descritivo |
| capacity | Int | Lugares |
| whatsapp | String? | WhatsApp do cliente da mesa |
| status | String | AVAILABLE ou OCCUPIED |

#### Sale (sales)
Venda/pedido — entidade central do sistema.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | String (cuid) | PK |
| total_amount | Decimal(10,2) | Valor total |
| payment_method | PaymentMethod | Metodo principal |
| status | SaleStatus | OPEN/PENDING/APPROVED/COMPLETED/CANCELLED |
| customer_id | String? | FK Customer |
| table_id | String? | FK Table |
| seller_id | String? | FK User (vendedor) |
| loyalty_discount | Decimal? | Desconto por pontos |
| notes | String? | Observacoes |
| shipping_cost | Decimal? | Custo do frete |
| shipping_method | String? | Metodo de envio |
| shipping_address | String? | Endereco de entrega |
| shipping_cep | String? | CEP destino |
| payment_link | String? | Link Mercado Pago |
| channel | String | PDV, ONLINE, WHATSAPP |
| nfce_status | String? | Status da NFC-e |
| nfce_access_key | String? | Chave de acesso 44 digitos |
| nfce_qr_url | String? | URL QR Code |
| nfce_danfe_url | String? | URL PDF DANFE |
| nfce_protocol | String? | Protocolo autorizacao |
| nfce_number | Int? | Numero sequencial |
| nfce_series | Int? | Serie (default: 1) |
| nfce_errors | String? | JSON de erros SEFAZ |

**Status Flow:**
```
OPEN → PENDING → APPROVED → COMPLETED
                ↘ CANCELLED
```

- `OPEN`: Pedido em mesa sendo montado
- `PENDING`: Aguardando pagamento
- `APPROVED`: Pago (legado)
- `COMPLETED`: Finalizado
- `CANCELLED`: Cancelado

#### SaleItem (sale_items)
Item de uma venda, com suporte a variantes.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| sale_id | String | FK Sale |
| product_id | String | FK Product |
| variant_id | String? | FK ProductVariant |
| quantity | Int | Quantidade |
| unit_price | Decimal(10,2) | Preco unitario no momento |
| size | String? | Snapshot do tamanho |
| color | String? | Snapshot da cor |

**Chave no carrinho:** `productId::variantId` para distinguir SKUs diferentes.

#### SalePayment (sale_payments)
Pagamento parcial (split tender).

| Campo | Tipo | Descricao |
|-------|------|-----------|
| sale_id | String | FK Sale |
| payment_method | PaymentMethod | CASH/CARD/PIX/LOYALTY/VOUCHER |
| amount | Decimal(10,2) | Valor deste pagamento |

**Exemplo:** Venda de R$100 → R$50 PIX + R$30 CARD + R$20 CASH

#### CashRegisterShift (cash_register_shifts)
Turno do caixa.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| opened_at | DateTime | Abertura |
| closed_at | DateTime? | Fechamento |
| opening_cash | Decimal(10,2) | Fundo de troco |
| closing_cash | Decimal? | Valor ao fechar |
| withdrawals | Decimal | Sangrias totais |
| user_id | String | FK User |
| status | String | OPEN ou CLOSED |

#### CustomerFollowup (customer_followups)
Registro de follow-up automatico.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| customer_id | String | FK Customer |
| sale_id | String (unique) | FK Sale (1 followup por venda) |
| type | String | "15_DAY_CASHBACK" |
| cashback_amount | Decimal(10,2) | Valor do cashback |
| points_added | Int | Pontos adicionados |
| whatsapp_status | String | SENT/FAILED/PENDING |
| message | String? | Mensagem enviada |

#### CommissionRule (commission_rules)
Regra de comissao por vendedor.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| user_id | String | FK User |
| type | CommissionType | FIXED_PERCENT / CATEGORY_PERCENT / TIERED |
| default_percent | Decimal(5,2) | % padrao |
| active | Boolean | Se ativa |

**Tipos:**
- `FIXED_PERCENT`: Mesmo percentual em todas as vendas
- `CATEGORY_PERCENT`: Percentual variavel por categoria (CommissionCategoryRule)
- `TIERED`: Escalonada por faixa de faturamento (CommissionTier)

#### Exchange (exchanges)
Troca ou devolucao.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| original_sale_id | String | FK Sale original |
| status | ExchangeStatus | PENDING/APPROVED/COMPLETED/CANCELLED |
| reason | ExchangeReason | WRONG_SIZE/DEFECT/DISLIKE/OTHER |
| reason_detail | String? | Detalhes |
| total_returned | Decimal(10,2) | Valor total devolvido |
| credit_generated | Decimal? | Credito gerado (voucher) |
| voucher_id | String? | FK Voucher gerado |
| refund_method | String? | VOUCHER/CASH/ORIGINAL_METHOD |
| processed_by | String? | FK User que processou |
| nfce_return_key | String? | Chave NFC-e de devolucao |

**Prazo padrao:** 30 dias (configuravel via StoreSettings `exchange_deadline_days`)

#### Voucher (vouchers)
Vale-troca ou vale-presente.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| code | String (unique) | Formato "VT-XXXX-XXXX" |
| type | VoucherType | EXCHANGE ou GIFT |
| original_value | Decimal(10,2) | Valor original |
| balance | Decimal(10,2) | Saldo atual |
| status | VoucherStatus | ACTIVE/USED/EXPIRED/CANCELLED |
| customer_id | String? | FK Customer |
| expires_at | DateTime | Data de expiracao |

**Validade padrao:** 90 dias
**Regra:** Status muda para USED quando `balance <= 0.001`

#### FiscalQueue (fiscal_queue)
Fila de contingencia para NFC-e.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| sale_id | String (unique) | FK Sale |
| payload | String | JSON do payload NFC-e |
| attempts | Int | Tentativas de envio |
| last_error | String? | Ultimo erro |
| status | String | PENDING/PROCESSING/SENT/FAILED |

#### FiscalEvent (fiscal_events)
Log de auditoria fiscal.

| Campo | Tipo | Descricao |
|-------|------|-----------|
| sale_id | String | FK Sale |
| event_type | String | transmitted/authorized/error/cancelled/retry |
| payload | String? | JSON de contexto |

#### StoreSettings (store_settings)
Configuracoes da loja (key-value).

| Chave | Tipo | Descricao |
|-------|------|-----------|
| cashback_percent | Numerico | % cashback (default: 10) |
| exchange_deadline_days | Numerico | Prazo troca em dias (default: 30) |
| store_name | Texto | Nome da loja |
| store_cnpj | Texto | CNPJ |
| store_ie | Texto | Inscricao Estadual |
| whatsapp_instance | Texto | ID da instancia Evolution API |
| fiscal_provider | Texto | "focusnfe" ou "plugnotas" |
| fiscal_api_key | Texto | API key do provider fiscal |

---

## API Endpoints

### Autenticacao

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/auth/login` | Login com email/password, retorna cookie de sessao |
| GET | `/api/auth/me` | Retorna usuario logado |
| POST | `/api/auth/logout` | Limpa sessao |

### Vendas (Core)

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/sales` | Listar vendas (filtros: status, nfce_status, channel, date) |
| POST | `/api/sales` | Criar venda completa (itens + pagamentos + estoque + fidelidade) |
| GET | `/api/sales/[id]/summary` | Dados do recibo |
| GET | `/api/sales/[id]/status` | Status NFC-e |
| GET | `/api/sales/[id]/exchangeable` | Itens passiveis de troca |
| POST | `/api/sales/[id]/notify` | Enviar notificacao da venda |

**POST /api/sales - Payload:**
```typescript
{
  items: Array<{
    productId: string
    variantId?: string
    quantity: number
    unitPrice: number
    size?: string
    color?: string
  }>
  payments: Array<{
    method: "CASH" | "CARD" | "PIX" | "LOYALTY" | "VOUCHER"
    amount: number
  }>
  customerId?: string
  tableId?: string
  sellerId?: string
  loyaltyDiscount?: number
  notes?: string
  channel?: "PDV" | "ONLINE" | "WHATSAPP"
  shippingCost?: number
  shippingMethod?: string
  shippingAddress?: string
  shippingCep?: string
  voucherCode?: string
}
```

**Logica de criacao:**
1. Valida estoque (produto ou variante)
2. Valida voucher (se usado): status ACTIVE, saldo suficiente, nao expirado
3. Cria Sale + SaleItems + SalePayments em transacao
4. Decrementa estoque por variante ou produto
5. Deduz pontos de fidelidade se LOYALTY
6. Adiciona pontos (1 BRL = 1 ponto) se tem customer
7. Registra VoucherUsage se voucher
8. Libera mesa se table_id
9. Verifica alerta de estoque minimo

### Produtos

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/products` | Listar (filtros: category, category_id, search, include_variants) |
| POST | `/api/products` | Criar produto |
| GET | `/api/products/[id]` | Detalhe |
| PATCH | `/api/products/[id]` | Atualizar |
| DELETE | `/api/products/[id]` | Deletar (soft) |
| GET | `/api/products/barcode/[code]` | Busca por codigo de barras |
| GET | `/api/products/low-stock` | Alerta de estoque baixo |
| POST | `/api/products/import` | Importacao NF-e (bulk) |
| GET | `/api/products/[id]/variants` | Listar variantes |
| POST | `/api/products/[id]/variants` | Criar variante |
| POST | `/api/products/[id]/variants/bulk` | Criacao em lote |
| PATCH | `/api/products/[id]/variants/[variantId]` | Editar variante |

### Categorias

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/categories` | Listar (arvore hierarquica) |
| POST | `/api/categories` | Criar |
| PATCH | `/api/categories/[id]` | Atualizar |
| DELETE | `/api/categories/[id]` | Deletar |

### Clientes

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/customers` | Listar |
| POST | `/api/customers` | Criar |
| GET | `/api/customers/[id]` | Detalhe com historico |
| GET | `/api/customers/search?phone=` | Busca por telefone |

### Mesas e Pedidos

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/tables` | Listar mesas com info de pedido aberto |
| POST | `/api/tables` | Criar mesa |
| GET | `/api/orders` | Listar pedidos abertos (status=OPEN) |
| POST | `/api/orders` | Abrir pedido em mesa |
| PATCH | `/api/orders/[id]` | Adicionar itens ou finalizar |

### Trocas e Devolucoes

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/exchanges` | Listar (filtros: status, date range) |
| POST | `/api/exchanges` | Criar solicitacao de troca |
| GET | `/api/exchanges/[id]` | Detalhe |
| POST | `/api/exchanges/[id]/approve` | Aprovar troca |
| POST | `/api/exchanges/[id]/cancel` | Cancelar troca |

**POST /api/exchanges - Payload:**
```typescript
{
  originalSaleId: string
  reason: "WRONG_SIZE" | "DEFECT" | "DISLIKE" | "OTHER"
  reasonDetail?: string
  refundMethod: "VOUCHER" | "CASH" | "ORIGINAL_METHOD"
  items: Array<{
    originalItemId: string
    action: "RETURN" | "EXCHANGE"
    quantity: number
  }>
}
```

### Vouchers

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/vouchers` | Listar |
| POST | `/api/vouchers` | Criar vale-presente |
| GET | `/api/vouchers/[code]` | Consultar saldo |
| POST | `/api/vouchers/[code]/redeem` | Usar voucher |
| POST | `/api/vouchers/[code]/cancel` | Cancelar voucher |

### Fiscal / NFC-e

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/fiscal/emit` | Emitir NFC-e |
| GET | `/api/fiscal/status/[saleId]` | Consultar status |
| POST | `/api/fiscal/cancel/[saleId]` | Cancelar NFC-e autorizada |
| GET | `/api/fiscal/queue` | Listar fila de contingencia |
| POST | `/api/fiscal/retry` | Reprocessar fila |
| POST | `/api/fiscal/webhook` | Callback do provider fiscal |

### Comissoes

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/commissions/calculate` | Calcular comissao (user_id, start, end) |
| GET | `/api/commissions/rules` | Listar regras |
| POST | `/api/commissions/rules` | Criar regra |
| GET | `/api/commissions/rules/[id]` | Detalhe da regra |
| GET | `/api/commissions/dashboard` | Metricas resumidas |

### Relatorios

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/reports/abc-curve` | Curva ABC (Pareto por receita) |
| GET | `/api/reports/profit-margin` | Margem por produto |
| GET | `/api/reports/stock-turnover` | Giro de estoque |
| GET | `/api/reports/stale-products` | Produtos parados |
| GET | `/api/reports/period-comparison` | Comparativo YoY/MoM |
| GET | `/api/reports/export` | Exportacao CSV |

### Analytics/Dashboard

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/analytics/dashboard` | Metricas hoje (receita, ticket medio, qtd vendas) |
| GET | `/api/analytics/categories` | Vendas por categoria |
| GET | `/api/analytics/revenue/daily` | Receita diaria |
| GET | `/api/analytics/revenue/weekly` | Receita semanal |
| GET | `/api/analytics/revenue/monthly` | Receita mensal |
| GET | `/api/analytics/top-sellers` | Top vendedores |

### Follow-up / Retention

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/cron/customer-followup` | Cron (8h diario): envia cashback 15 dias |
| POST | `/api/cron/customer-followup` | Trigger manual |
| GET | `/api/followups` | Listar follow-ups enviados |
| POST | `/api/cron/vouchers/expire` | Expirar vouchers vencidos |

### Cashback

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/cashback` | Dashboard de fidelidade |

### Checkout / Pagamento Online

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/checkout/create-intent` | Criar pagamento Mercado Pago |
| POST | `/api/checkout/payment-link` | Gerar link para venda online |
| POST | `/api/webhooks/mercadopago` | Webhook de status |

### Frete

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/shipping/calculate` | Calcular opcoes de frete |

### WhatsApp

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/whatsapp/send` | Enviar mensagem |
| GET | `/api/whatsapp/instance` | Config da instancia |
| POST | `/api/whatsapp/connect` | Conectar Evolution API |
| GET | `/api/whatsapp/status` | Status da instancia |
| POST | `/api/whatsapp/webhook` | Webhook Evolution API |

### Etiquetas

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/labels/generate` | Gerar PDF de etiquetas |
| GET | `/api/labels/templates` | Templates disponiveis |

### Metas de Vendas

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/sales-goals` | Listar metas |
| POST | `/api/sales-goals` | Criar meta |

### Staff / Settings

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET/POST | `/api/staff` | CRUD de funcionarios |
| GET | `/api/staff/[id]` | Detalhe |
| GET/POST | `/api/settings` | Configuracoes key-value |

### Caixa

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET/POST | `/api/cash-register` | Abertura/fechamento de caixa |

---

## Paginas e Navegacao

### Mapa de Paginas

| Rota | Pagina | Acesso | Descricao |
|------|--------|--------|-----------|
| `/login` | Login | Publico | Email/senha |
| `/` | Dashboard | ADMIN/EMPLOYEE | Metricas do dia, vendas recentes, alertas |
| `/pdv` | PDV | ADMIN/EMPLOYEE | Tela principal de venda |
| `/products` | Produtos | ADMIN | CRUD, importacao, variantes |
| `/categories` | Categorias | ADMIN | Arvore hierarquica |
| `/customers` | Clientes | ADMIN/EMPLOYEE | CRM, pontos, historico |
| `/sales` | Vendas | ADMIN/EMPLOYEE | Historico, filtros, NFC-e |
| `/tables` | Mesas | ADMIN/EMPLOYEE | Mapa de mesas, pedidos |
| `/exchanges` | Trocas | ADMIN | Processar trocas/devolucoes |
| `/vouchers` | Vouchers | ADMIN | Criar/gerenciar vales |
| `/fiscal` | Fiscal | ADMIN | NFC-e, fila, reprocessar |
| `/commissions` | Comissoes | ADMIN | Regras, calculo, dashboard |
| `/reports` | Relatorios | ADMIN | ABC, margem, giro, comparativo |
| `/followups` | Follow-ups | ADMIN | Historico WhatsApp |
| `/labels` | Etiquetas | ADMIN | Impressao PDF |
| `/staff` | Equipe | ADMIN | CRUD usuarios |
| `/settings` | Config | ADMIN | Parametros da loja |

### Navegacao

A sidebar esquerda (desktop) ou bottom nav (mobile) organiza em secoes:
- **Vendas**: PDV, Vendas, Mesas
- **Catalogo**: Produtos, Categorias
- **Clientes**: Clientes, Follow-ups, Cashback
- **Financeiro**: Comissoes, Relatorios
- **Operacional**: Trocas, Vouchers, Fiscal, Etiquetas
- **Admin**: Equipe, Configuracoes

---

## Componentes

### POS (Ponto de Venda)

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| PosProductGrid | `pos/` | Grid de produtos com busca e filtro por categoria |
| CartSidebar | `pos/` | Carrinho desktop (lateral direita) |
| CartBottomSheet | `pos/` | Carrinho mobile (drawer inferior) |
| CartItemCard | `pos/` | Item no carrinho com qty +/- e remover |
| MultiPaymentModal | `pos/multi-payment-modal.tsx` | Modal de pagamento multiplo |
| VoucherPaymentInput | `pos/voucher-payment-input.tsx` | Input de codigo de voucher |
| CustomerIdentificationModal | `pos/` | Busca cliente por telefone |
| VariantSelectorModal | `pos/` | Seletor de tamanho/cor |
| CashRegisterDrawer | `pos/` | Abertura/fechamento de caixa |
| ReceiptPrint | `pos/` | Formatacao para impressora termica |

### Produto

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| ProductModal | `product-modal.tsx` | Criar/editar produto com campos fiscais |
| VariantGridManager | `variant-grid-manager.tsx` | Grade de variantes (bulk) |

### Fiscal

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| NfceDetailsModal | `fiscal/` | QR, chave, DANFE |
| NfceStatusBadge | `fiscal/` | Badge visual de status |

### Trocas

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| ExchangeStatusBadge | `exchanges/` | Badge de status da troca |

### Relatorios

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| DateRangePicker | `reports/` | Seletor de periodo |
| ExportButton | `reports/` | Botao de exportacao CSV |

### Compartilhados

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| Sidebar | `sidebar.tsx` | Navegacao lateral responsiva |
| ShippingCalculator | `shipping-calculator.tsx` | Calculo de frete por CEP |

---

## Hooks Customizados

### useBarcodeScanner

```typescript
useBarcodeScanner(onScan: (code: string) => void): void
```

Detecta input de leitor de codigo de barras vs digitacao humana:
- **Threshold:** 30ms entre caracteres = scanner, >50ms = humano
- **Trigger:** Tecla Enter completa a leitura
- **Exclusao:** Nao dispara quando focus esta em `<input>` ou `<textarea>`
- **Uso:** Ativo na pagina do PDV para busca rapida de produto

### useProducts

```typescript
useProducts(): {
  products: Product[]
  loading: boolean
  error: string | null
  refetch: () => void
}
```

Fetch de produtos com variantes ativas incluidas:
- Filtra apenas variantes com `active=true`
- Ordena por tamanho/cor
- Cache local com refetch manual

### useOfflineSync

```typescript
useOfflineSync(): {
  pendingCount: number
  syncAll: () => Promise<void>
  queueSale: (sale: DraftSale) => Promise<void>
}
```

Sincronizacao offline com IndexedDB (Dexie):
- Salva vendas em rascunho quando sem internet
- Sincroniza automaticamente ao reconectar
- Marca como synced/error
- Exibe contador de pendentes

---

## Servicos e Bibliotecas

### Auth (`src/lib/auth.ts`)

| Funcao | Descricao |
|--------|-----------|
| `hashPassword(pw)` | Scrypt com salt aleatorio |
| `verifyPassword(pw, hash)` | Comparacao timing-safe |
| `createSessionToken(userId)` | Base64 + HMAC-SHA256 |
| `getSession(cookies)` | Recupera sessao do cookie |
| `requireAdmin(request)` | Guard para rotas admin |

### FiscalService (`src/lib/fiscal/FiscalService.ts`)

Servico completo de NFC-e:

| Funcao | Descricao |
|--------|-----------|
| `buildNfcePayload(sale)` | Monta JSON para transmissao |
| `transmit(payload)` | Envia para FocusNFe/PlugNotas |
| `getNextNumber(series)` | Proximo numero (atomico SQL) |
| `consultStatus(saleId)` | Consulta status na API |
| `cancel(saleId, justificativa)` | Cancela nota autorizada |
| `enqueue(saleId, payload)` | Fila de contingencia |
| `processQueue()` | Reprocessa itens pendentes |
| `logEvent(saleId, type, payload)` | Log de auditoria |

**Mapeamento de pagamento fiscal:**
- CASH → codigo 01 (Dinheiro)
- CARD → codigo 03 (Cartao)
- PIX → codigo 17 (PIX)
- LOYALTY → codigo 99 (Outros)
- VOUCHER → codigo 99 (Outros)

**Impostos (Simples Nacional):**
- ICMS: CSOSN 102 (sem credito)
- PIS: CST 49 (outras operacoes)
- COFINS: CST 49

### Commissions (`src/lib/commissions/calculate.ts`)

```typescript
calculateCommission(userId: string, startDate: Date, endDate: Date): {
  totalSales: number
  salesCount: number
  commissionAmount: number
  effectivePercent: number
  breakdown: Array<{ saleId, amount, commission }>
}
```

**Regras:**
1. `FIXED_PERCENT`: `total_vendas × percent`
2. `CATEGORY_PERCENT`: Soma de `(valor_item × percent_categoria)` por item
3. `TIERED`: Identifica faixa de faturamento → aplica % da faixa

### Exchanges (`src/lib/exchanges/process.ts`)

| Funcao | Descricao |
|--------|-----------|
| `getExchangeableItems(saleId)` | Items elegiveis (prazo + qty disponivel) |
| `processExchange(data)` | Transacao: restaura estoque + gera voucher |

### Vouchers (`src/lib/vouchers/service.ts`)

| Funcao | Descricao |
|--------|-----------|
| `generateVoucherCode()` | "VT-XXXX-XXXX" alfanumerico |
| `createVoucher(data)` | Cria com retry (ate 5x colisao) |
| `redeemVoucher(code, amount, saleId)` | Deduz saldo atomicamente |
| `cancelVoucher(code)` | Cancela se ACTIVE |
| `expireVouchers()` | Cron: expira vencidos |

### Reports (`src/lib/reports/`)

| Arquivo | Descricao |
|---------|-----------|
| `abc-curve.ts` | Classificacao ABC por % da receita (A=80%, B=15%, C=5%) |
| `profit-margin.ts` | `(sell - cost) / sell × 100` por produto |
| `stock-turnover.ts` | `vendidos / estoque_medio` no periodo |
| `stale-products.ts` | Produtos sem venda no periodo |
| `period-comparison.ts` | Delta absoluto e percentual entre periodos |
| `export-csv.ts` | Exportacao tabular |

### WhatsApp (`src/lib/whatsapp/evolution-api.ts`)

| Funcao | Descricao |
|--------|-----------|
| `sendText(phone, message)` | Mensagem de texto simples |
| `sendMedia(phone, url, caption)` | Imagem/documento |
| `getInstanceStatus()` | Status da conexao |
| `connectInstance()` | QR Code para conexao |

### Shipping (`src/lib/shipping/calculate.ts`)

| Metodo | Base | Por kg | Prazo |
|--------|------|--------|-------|
| PAC | R$15 | +R$2/kg | 7-10 dias |
| SEDEX | R$25 | +R$4/kg | 3-5 dias |
| MOTOBOY | R$12 flat | - | Mesmo dia |
| RETIRADA | Gratis | - | Imediato |

**Logica:** Calcula peso total dos itens (default 0.3kg), aplica formula por metodo. MOTOBOY disponivel apenas para mesma regiao (primeiros 2 digitos do CEP).

### Labels (`src/lib/labels/`)

Geracao de etiquetas em PDF (jsPDF + JsBarcode):
- Templates: Pimaco, BOPP, personalizado
- Conteudo: Codigo de barras, nome, preco, tamanho/cor
- Formato: Folha A4 ou rolo termico

### Validations (`src/lib/validations/`)

Schemas Zod para cada dominio:

| Arquivo | Schemas |
|---------|---------|
| `pos.ts` | CartItem, CreateSale, Payment, CustomerSearch |
| `fiscal.ts` | EmitNfce, CancelNfce |
| `exchanges.ts` | CreateExchange, ApproveExchange |
| `commissions.ts` | CreateRule, CalculateQuery |
| `vouchers.ts` | CreateVoucher, RedeemVoucher |
| `reports.ts` | DateRange, ExportFormat |
| `labels.ts` | LabelTemplate, LabelData |

---

## Fluxos de Negocio

### 1. Fluxo de Venda Presencial (PDV)

```
1. Atendente abre tela /pdv
2. Escaneia codigo de barras OU busca por nome
   → Se produto tem variantes: abre VariantSelectorModal
   → Seleciona tamanho/cor
3. Item adicionado ao carrinho (chave: productId::variantId)
4. Repete para cada item
5. Identifica cliente (opcional): CustomerIdentificationModal
   → Busca por telefone
   → Exibe pontos disponiveis
6. Clica "Finalizar Venda"
7. MultiPaymentModal:
   → Seleciona metodo(s): CASH, CARD, PIX, LOYALTY, VOUCHER
   → Se VOUCHER: digita codigo, valida saldo
   → Se LOYALTY: define valor em pontos
   → Distribui valores ate cobrir total
8. POST /api/sales
9. Estoque decrementado
10. Pontos de fidelidade adicionados
11. Recibo disponivel (impressao termica)
12. NFC-e emitida automaticamente (se configurado)
```

### 2. Fluxo de Mesa/Comanda

```
1. Atendente vai em /tables
2. Seleciona mesa disponivel → marca OCCUPIED
3. Abre pedido (status=OPEN) → redireciona para PDV em modo mesa
4. Adiciona itens ao pedido (pode adicionar em varias visitas)
5. Quando cliente pede a conta:
   → Finaliza pedido → muda para PENDING
   → Processa pagamento
   → Mesa volta para AVAILABLE
6. Opcional: envia resumo por WhatsApp para o numero da mesa
```

### 3. Fluxo de Troca/Devolucao

```
1. Atendente vai em /exchanges
2. Busca venda original pelo ID ou data
3. Sistema verifica:
   → Prazo de 30 dias (exchange_deadline_days)
   → Itens ja trocados anteriormente
4. Seleciona itens para troca e quantidades
5. Escolhe motivo: WRONG_SIZE, DEFECT, DISLIKE, OTHER
6. Escolhe reembolso: VOUCHER, CASH, ORIGINAL_METHOD
7. POST /api/exchanges → cria com status PENDING
8. Admin aprova → POST /api/exchanges/[id]/approve
9. Sistema executa:
   → Restaura estoque (variante ou produto)
   → Se reembolso VOUCHER: gera VT-XXXX-XXXX (90 dias)
   → Muda status para COMPLETED
```

### 4. Fluxo Fiscal (NFC-e)

```
1. Venda finalizada → trigger emissao
2. FiscalService.buildNfcePayload():
   → Monta itens com NCM, CFOP, ICMS, PIS, COFINS
   → Mapeia pagamentos para codigos fiscais
   → Inclui CPF do cliente (se informado)
   → Obtem proximo numero sequencial
3. FiscalService.transmit():
   → POST para API do provider (FocusNFe/PlugNotas)
   → Se sucesso: salva access_key, QR, DANFE URL, protocolo
   → Se erro SEFAZ: salva erros, marca "error"
   → Se falha de rede: enqueue para contingencia
4. Contingencia:
   → Payload salvo em FiscalQueue
   → Cron/manual reprocessa periodicamente
   → Ao autorizar: atualiza Sale com dados fiscais
5. Cancelamento:
   → Ate 24h apos autorizacao
   → Requer justificativa
   → Gera evento "cancelled"
```

### 5. Fluxo de Follow-up (Cashback Automatico)

```
1. Cron diario as 8h: GET /api/cron/customer-followup
2. Busca vendas APPROVED de exatamente 15 dias atras
3. Filtra: cliente com telefone/WhatsApp, sem followup existente
4. Para cada venda elegivel:
   → Calcula cashback (10% do total ou config)
   → Compoe mensagem personalizada
   → Envia via Evolution API (WhatsApp)
   → Adiciona pontos ao cliente
   → Registra CustomerFollowup
5. Se WhatsApp falha: marca status FAILED para retry
```

### 6. Fluxo de Comissao

```
1. Admin acessa /commissions
2. Cria regra para vendedor:
   → FIXED_PERCENT: 5% em tudo
   → CATEGORY_PERCENT: 8% em vestidos, 3% em basicos
   → TIERED: ate 5k=3%, 5k-10k=5%, >10k=8%
3. No final do periodo:
   → GET /api/commissions/calculate?user_id=X&start=...&end=...
   → Retorna valor total, vendas, % efetivo, detalhamento
```

### 7. Fluxo de Venda Online

```
1. Venda criada com channel=ONLINE ou WHATSAPP
2. POST /api/checkout/payment-link
   → Cria preferencia Mercado Pago (Checkout Pro)
   → Retorna URL de pagamento
3. Link enviado ao cliente (WhatsApp ou email)
4. Cliente paga
5. Webhook /api/webhooks/mercadopago
   → Recebe notificacao de aprovacao
   → Atualiza Sale status para APPROVED
   → Decrementa estoque por variante
6. Frete calculado previamente e adicionado ao total
```

---

## Integracoes Externas

### Mercado Pago

| Funcionalidade | Uso |
|---------------|-----|
| Checkout Pro | Links de pagamento para vendas online |
| Point Smart | Pagamento presencial com maquininha |
| Webhooks | Notificacao de status de pagamento |
| QR Code | Pagamento por QR no PDV |

**Env vars:**
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_PUBLIC_KEY`
- `MERCADOPAGO_WEBHOOK_SECRET`

### Evolution API (WhatsApp)

| Funcionalidade | Uso |
|---------------|-----|
| Envio de texto | Follow-ups, notificacoes |
| Envio de midia | Resumo de pedido com imagem |
| Status da instancia | Monitoramento de conexao |
| QR Code de conexao | Setup inicial |
| Webhook | Recebimento de mensagens |

**Env vars:**
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`

### FocusNFe / PlugNotas (Fiscal)

| Funcionalidade | Uso |
|---------------|-----|
| Emissao NFC-e | Nota fiscal de consumidor |
| Consulta status | Verificar autorizacao |
| Cancelamento | Revogar nota |
| Webhook | Callback de autorizacao/rejeicao |

**Env vars:**
- `FISCAL_PROVIDER` ("focusnfe" ou "plugnotas")
- `FISCAL_API_KEY`
- `FISCAL_API_URL`
- `FISCAL_ENVIRONMENT` ("production" ou "homologation")

### Supabase (Banco de Dados)

| Funcionalidade | Uso |
|---------------|-----|
| PostgreSQL | Banco principal |
| Connection Pooling | pgbouncer (porta 6543) para app |
| Direct Connection | Porta 5432 para migrations/push |

**Env vars:**
- `DATABASE_URL` (pgbouncer para app, direta para migrations)

---

## PWA e Offline

### Manifest (`public/manifest.json`)

```json
{
  "name": "PDV ZapFlow",
  "short_name": "PDV",
  "start_url": "/pdv",
  "display": "standalone",
  "theme_color": "#22c55e",
  "orientation": "any",
  "categories": ["business", "productivity"]
}
```

### Service Worker (`public/sw.js`)

Estrategias de cache (Workbox):

| Rota | Estrategia | TTL | Max Entries |
|------|-----------|-----|-------------|
| `/` | Network-first | fallback cache | - |
| `/pdv` | Network-first | 24h | - |
| Imagens | Cache-first | 7 dias | - |
| `/api/products` | Network-first (5s timeout) | 5min | 50 |
| Static assets | Precache | Build hash | - |

### Offline Mode

1. **Deteccao:** `navigator.onLine` + event listeners
2. **Fila de vendas:** IndexedDB via Dexie
3. **Sync:** Ao reconectar, sincroniza pendentes com `/api/sales`
4. **UI:** `OfflineBanner` indica status de conexao
5. **Produtos:** Cache de 5min garante listagem sem rede

---

## Seguranca e Autenticacao

### Autenticacao

- **Metodo:** Cookie httpOnly com token HMAC-SHA256
- **Hash de senha:** Scrypt (salt + key derivation)
- **Sessao:** Token assinado com `SESSION_SECRET`
- **Duracao:** Configuravel (padrao: 7 dias)

### Autorizacao

- **ADMIN:** Acesso total a todas as rotas e funcionalidades
- **EMPLOYEE:** Acesso restrito a PDV, vendas, mesas, clientes
- **Guard:** `requireAdmin()` em rotas protegidas

### Protecoes

| Medida | Implementacao |
|--------|--------------|
| CSRF | Cookie SameSite=Strict |
| XSS | Sem dangerouslySetInnerHTML |
| SQL Injection | Prisma ORM (prepared statements) |
| Webhook Auth | HMAC signature validation (Mercado Pago) |
| Cron Auth | Bearer token (`CRON_SECRET`) |
| Rate Limit | A implementar por rota |

### Variaveis Sensiveis

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=...
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
EVOLUTION_API_KEY=...
FISCAL_API_KEY=...
CRON_SECRET=...
```

---

## Configuracao e Deploy

### Variaveis de Ambiente

```env
# Banco de Dados
DATABASE_URL=postgresql://user:pass@host:6543/db?pgbouncer=true

# Autenticacao
SESSION_SECRET=random-32-chars

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_PUBLIC_KEY=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=...

# WhatsApp (Evolution API)
EVOLUTION_API_URL=https://evolution.example.com
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE_NAME=pdv-zapflow

# Fiscal
FISCAL_PROVIDER=focusnfe
FISCAL_API_KEY=...
FISCAL_API_URL=https://api.focusnfe.com.br/v2
FISCAL_ENVIRONMENT=production

# Cron
CRON_SECRET=random-secret

# App
NEXT_PUBLIC_APP_URL=https://pdv.example.com
```

### Comandos

```bash
# Desenvolvimento
npm install          # Instalar deps
npm run dev          # Dev server (localhost:3000)

# Banco de dados
npm run db:generate  # Gerar Prisma Client
npm run db:push      # Aplicar schema (URL direta, nao pgbouncer!)
npm run db:studio    # Interface visual do banco

# Build
npm run build        # prisma generate + next build

# Producao
npm start            # Iniciar servidor
```

### Deploy (Vercel)

1. Conectar repositorio ao Vercel
2. Configurar env vars no dashboard
3. Build command: `npm run build`
4. Output: `.next/`
5. Cron jobs: configurar em `vercel.json` ou `vercel.ts`

### Crons Necessarios

| Schedule | Endpoint | Funcao |
|----------|----------|--------|
| `0 8 * * *` | `/api/cron/customer-followup` | Follow-up 15 dias |
| `0 0 * * *` | `/api/cron/vouchers/expire` | Expirar vouchers |
| `*/30 * * * *` | `/api/fiscal/retry` | Reprocessar fila fiscal |

---

## Decisoes Arquiteturais

### 1. Variantes vs Produto Simples

**Decisao:** Produtos podem optar por ter variantes (`has_variants=true`).
**Motivo:** Moda/confeccao exige grade (P/M/G/GG × cores), mas produtos simples (acessorios) nao precisam.
**Impacto:** Estoque e gerenciado em `Product.stock_quantity` OU `ProductVariant.stock_quantity`, nunca ambos.

### 2. Multi-pagamento (Split Tender)

**Decisao:** Uma venda pode ter N registros de `SalePayment`.
**Motivo:** Clientes brasileiros frequentemente dividem entre dinheiro + cartao + PIX.
**Impacto:** `Sale.payment_method` armazena o metodo principal; `SalePayment[]` tem o detalhamento real.

### 3. Chave composta no carrinho

**Decisao:** Carrinho usa `productId::variantId` como key.
**Motivo:** Mesmo produto em tamanhos diferentes sao SKUs distintos.
**Impacto:** Componentes de carrinho precisam parsear a chave para exibir info correta.

### 4. Contingencia Fiscal

**Decisao:** Falha de rede na emissao NFC-e enfileira para retry posterior.
**Motivo:** Vendas nao podem ser bloqueadas por indisponibilidade da SEFAZ.
**Impacto:** `FiscalQueue` com retry automatico; Sale recebe status "contingency" ate resolucao.

### 5. Voucher como pagamento

**Decisao:** Voucher e um `PaymentMethod` no enum, tratado como split.
**Motivo:** Vale-troca e vale-presente devem ser usados parcial ou totalmente.
**Impacto:** Validacao especifica: checar status ACTIVE, saldo, expiracao antes de aceitar.

### 6. Follow-up automatico (15 dias)

**Decisao:** Cron diario envia cashback de 10% para clientes que compraram ha 15 dias.
**Motivo:** Retencao de clientes em moda e critica; 15 dias e o sweet spot para recompra.
**Impacto:** Requires Evolution API ativa e customer com telefone.

### 7. Categorias hierarquicas com emoji

**Decisao:** Categorias usam auto-referencia (`parent_id`) e nomes com emoji.
**Motivo:** Interface visual intuitiva para usuario brasileiro; hierarquia para classificacao granular.
**Impacto:** Queries precisam resolver arvore; UI exibe com indentacao.

### 8. PWA com Offline-first no PDV

**Decisao:** Pagina /pdv funciona offline com cache de produtos e fila de vendas.
**Motivo:** Lojas podem ter internet instavel; PDV nao pode parar.
**Impacto:** Service Worker + IndexedDB + sync automatico.

### 9. Campos fiscais no produto

**Decisao:** NCM, CFOP e unidade fiscal como campos opcionais no Product.
**Motivo:** NFC-e exige estes dados por item; manter junto simplifica emissao.
**Impacto:** Migrar produtos antigos requer preenchimento retroativo.

### 10. Session-based auth (nao JWT stateless)

**Decisao:** Cookie httpOnly com token HMAC vs JWT puro.
**Motivo:** Mais seguro contra XSS; permite invalidacao server-side.
**Impacto:** Requires SESSION_SECRET; nao escala horizontalmente sem shared store (ok para Vercel serverless).

---

## Proximos Passos Sugeridos

### Curto Prazo
- [ ] Implementar rate limiting nos endpoints
- [ ] Completar testes E2E com Playwright
- [ ] Adicionar RLS (Row Level Security) no Supabase
- [ ] Limpar `.env.example` (remover credenciais reais)

### Medio Prazo
- [ ] Dashboard real-time com WebSocket/SSE
- [ ] Integracao com transportadoras reais (Correios API, Melhor Envio)
- [ ] Modulo de compras/fornecedores
- [ ] Controle de lotes e validade

### Longo Prazo
- [ ] Multi-loja (tenant isolation)
- [ ] App mobile nativo (React Native)
- [ ] BI avancado com data warehouse
- [ ] Integracao com marketplaces (Shopee, Mercado Livre)
