# PDV-ZapFlow: Custos de Infraestrutura

> Data: 2026-04-20 | Cotacao aproximada: USD 1 = R$ 5,80

---

## 1. CUSTO FIXO MENSAL BASE (antes de ter clientes)

| Servico | Plano | Custo Mensal | Obs |
|---------|-------|-------------|-----|
| Supabase | Pro | R$ 145 ($25) | 8 GB DB, 100K MAUs |
| Vercel | Pro (1 seat) | R$ 116 ($20) | 1 TB bandwidth |
| Evolution API | VPS self-hosted | R$ 40 | 1 vCPU, 1 GB RAM (Contabo/Hetzner) |
| FocusNFe | Retail NFC-e | R$ 59,90 | 500 NFC-e + 100 NF-e/mes |
| Mercado Pago | - | R$ 0 | Sem custo fixo, so taxa por transacao |
| Vercel Blob | Storage | R$ 1 | Ate 5 GB de fotos |
| Dominio .com.br | Registro.br | R$ 3,33 | R$ 40/ano |
| Email transacional | Resend Free | R$ 0 | 3.000 emails/mes |
| **TOTAL FIXO** | | **R$ 365/mes** | |

---

## 2. CUSTOS VARIAVEIS POR CLIENTE

### 2.1 Banco de Dados (Supabase)

Cada cliente (lojista) gera dados de: produtos, variantes, vendas, clientes, notas fiscais.

| Metrica | Estimativa por lojista/mes |
|---------|---------------------------|
| Produtos cadastrados | ~100-300 (com variantes: ~500-1500 rows) |
| Vendas/mes | ~200-500 vendas |
| Storage por lojista | ~5-15 MB/mes de dados |
| Fotos de produto | ~50-200 MB (uma vez, cresce pouco) |

**Custo marginal por lojista no banco**: praticamente zero ate ~500 lojistas no plano Pro (8 GB).
- 500 lojistas x 15 MB = 7,5 GB (quase o limite do Pro)
- A partir de 500+: overage $0,125/GB = ~R$ 0,72/GB

### 2.2 NFC-e (FocusNFe)

| Cenario | Notas/mes | Custo |
|---------|-----------|-------|
| Plano Retail inclui | 500 NFC-e | R$ 59,90 (incluso) |
| Overage | +R$ 0,05/nota | Variavel |

**Modelo**: So clientes do plano **Pro** (R$ 89/mes) e **Business** (R$ 149/mes) emitem NFC-e.

| Lojistas emitindo NFC-e | Notas totais/mes | Custo FocusNFe |
|--------------------------|-----------------|----------------|
| 10 lojistas x 200 vendas | 2.000 | R$ 59,90 + (1.500 x R$0,05) = **R$ 135** |
| 50 lojistas x 200 vendas | 10.000 | Precisa plano Growth R$ 548 + (6.000 x R$0,12) = **R$ 1.268** |
| 200 lojistas x 200 vendas | 40.000 | Growth R$ 548 + (36.000 x R$0,12) = **R$ 4.868** |
| 500 lojistas x 200 vendas | 100.000 | Enterprise (negociar ~R$ 0,05/nota) = **~R$ 5.000** |

**Custo por lojista NFC-e**: R$ 5-15/mes (depende do volume total negociado)

### 2.3 WhatsApp (Evolution API + Meta)

**Evolution API** (self-hosted): custo fixo do VPS, nao escala por mensagem.

**Meta WhatsApp Business API** (custo real por mensagem):

| Tipo de mensagem | Custo unitario (Brasil) | Uso tipico |
|-----------------|------------------------|-----------|
| Marketing (template) | R$ 0,36 ($0,0625) | Campanhas, follow-up |
| Utility (template) | R$ 0,04 ($0,0068) | Confirmacao pedido, envio |
| Service (dentro de 24h) | GRATIS | Atendimento |

**Cenarios por lojista/mes**:

| Uso | Msgs marketing | Msgs utility | Custo |
|-----|---------------|-------------|-------|
| Basico (so confirmacoes) | 0 | 200 | R$ 8 |
| Medio (follow-up + confirmacoes) | 50 | 200 | R$ 26 |
| Intenso (campanhas + follow-up) | 200 | 300 | R$ 84 |

**Modelo recomendado**: Cobrar WhatsApp marketing a parte ou incluir pacote limitado no plano.

### 2.4 Processamento de Pagamento (Mercado Pago)

O lojista paga a taxa, nao nos. Mas e importante saber:

| Metodo | Taxa MP | Em R$ 100 de venda |
|--------|---------|---------------------|
| PIX | 0,49% | R$ 0,49 |
| Debito | 1,99% | R$ 1,99 |
| Credito a vista | 3,31-4,98% | R$ 3,31-4,98 |

**Custo para o ZapFlow**: R$ 0 (quem paga e o lojista).
Oportunidade: no futuro, negociar taxa melhor em volume e repassar como beneficio.

### 2.5 Hosting/Bandwidth (Vercel)

| Metrica | Incluido no Pro | Custo extra |
|---------|----------------|-------------|
| Bandwidth | 1 TB/mes | $0,15/GB (R$ 0,87/GB) |
| Serverless | $20 credito incluso | $0,128/CPU-hora |
| Image Optimization | 5.000/mes incluso | $5/1.000 |

**Estimativa por lojista**: ~50-200 MB bandwidth/mes (acesso ao PDV, carregamento de fotos).
- 500 lojistas x 200 MB = 100 GB (bem dentro do 1 TB)
- 5.000 lojistas x 200 MB = 1 TB (no limite, pode precisar upgrade)

---

## 3. CUSTO POR LOJISTA (UNIT ECONOMICS)

### 3.1 Custo marginal por tipo de cliente

| Componente | Gratis | Essencial (R$49) | Pro (R$89) | Business (R$149) |
|-----------|--------|-------------------|------------|------------------|
| Banco de dados | R$ 0,30 | R$ 0,50 | R$ 0,80 | R$ 1,50 |
| Hosting/CDN | R$ 0,50 | R$ 0,80 | R$ 1,00 | R$ 1,50 |
| Fotos (storage) | R$ 0,10 | R$ 0,20 | R$ 0,30 | R$ 0,50 |
| NFC-e (FocusNFe) | - | - | R$ 10,00 | R$ 10,00 |
| WhatsApp (utility) | - | R$ 4,00 | R$ 8,00 | R$ 12,00 |
| Suporte (tempo) | R$ 0 | R$ 5,00 | R$ 10,00 | R$ 15,00 |
| **Total custo/lojista** | **R$ 0,90** | **R$ 10,50** | **R$ 30,10** | **R$ 40,50** |
| **Receita/lojista** | **R$ 0** | **R$ 49** | **R$ 89** | **R$ 149** |
| **Margem bruta** | **-R$ 0,90** | **R$ 38,50 (79%)** | **R$ 58,90 (66%)** | **R$ 108,50 (73%)** |

### 3.2 Margem bruta media ponderada

Assumindo mix: 40% gratis, 35% Essencial, 20% Pro, 5% Business:

| | % usuarios | Receita | Custo variavel | Margem |
|---|-----------|---------|---------------|--------|
| Gratis | 40% | R$ 0 | R$ 0,90 | -R$ 0,90 |
| Essencial | 35% | R$ 49 | R$ 10,50 | +R$ 38,50 |
| Pro | 20% | R$ 89 | R$ 30,10 | +R$ 58,90 |
| Business | 5% | R$ 149 | R$ 40,50 | +R$ 108,50 |
| **Media ponderada** | | **R$ 36,40** | **R$ 10,58** | **R$ 25,82 (71%)** |

**Margem bruta media: 71%** (excelente para SaaS, benchmark e 70-80%)

---

## 4. PROJECAO DE CUSTOS MES A MES

### Premissas:
- Mix: 40% gratis / 35% essencial / 20% pro / 5% business
- Conversao free-to-paid melhora ao longo do tempo
- Upgrade de infra nos marcos indicados

| Mes | Usuarios | Pagantes | MRR | Custo Fixo | Custo Variavel | Custo Total | Lucro/Prejuizo |
|-----|----------|---------|-----|-----------|---------------|------------|----------------|
| **1** | 20 | 8 | R$ 524 | R$ 365 | R$ 139 | **R$ 504** | **+R$ 20** |
| **2** | 40 | 16 | R$ 1.049 | R$ 365 | R$ 277 | **R$ 642** | **+R$ 407** |
| **3** | 100 | 40 | R$ 2.622 | R$ 365 | R$ 693 | **R$ 1.058** | **+R$ 1.564** |
| **4** | 170 | 68 | R$ 4.458 | R$ 365 | R$ 1.178 | **R$ 1.543** | **+R$ 2.915** |
| **5** | 300 | 120 | R$ 7.866 | R$ 365 | R$ 2.079 | **R$ 2.444** | **+R$ 5.422** |
| **6** | 500 | 200 | R$ 13.110 | R$ 515* | R$ 3.465 | **R$ 3.980** | **+R$ 9.130** |
| **7** | 700 | 300 | R$ 19.665 | R$ 515 | R$ 5.148 | **R$ 5.663** | **+R$ 14.002** |
| **8** | 1.000 | 450 | R$ 29.498 | R$ 515 | R$ 7.722 | **R$ 8.237** | **+R$ 21.261** |
| **9** | 1.300 | 600 | R$ 39.330 | R$ 665** | R$ 10.296 | **R$ 10.961** | **+R$ 28.369** |
| **10** | 1.700 | 800 | R$ 52.440 | R$ 665 | R$ 13.728 | **R$ 14.393** | **+R$ 38.047** |
| **11** | 2.200 | 1.050 | R$ 68.828 | R$ 665 | R$ 18.018 | **R$ 18.683** | **+R$ 50.145** |
| **12** | 2.800 | 1.400 | R$ 91.770 | R$ 965*** | R$ 24.024 | **R$ 24.989** | **+R$ 66.781** |
| **15** | 4.000 | 2.200 | R$ 144.210 | R$ 965 | R$ 37.752 | **R$ 38.717** | **+R$ 105.493** |
| **18** | 5.000 | 3.000 | R$ 196.650 | R$ 1.365**** | R$ 51.480 | **R$ 52.845** | **+R$ 143.805** |

### Upgrades de infra nos marcos:

| Marco | O que muda | Custo adicional |
|-------|-----------|-----------------|
| * Mes 6 (500 users) | Supabase: overage DB + FocusNFe Growth | +R$ 150/mes |
| ** Mes 9 (1.300 users) | Vercel: bandwidth perto do limite, VPS maior para Evolution | +R$ 150/mes |
| *** Mes 12 (2.800 users) | Supabase Team ou segundo projeto, Resend Pro | +R$ 300/mes |
| **** Mes 18 (5.000 users) | Vercel Pro upgrade, FocusNFe Enterprise, VPS cluster | +R$ 400/mes |

---

## 5. ACUMULADO: INVESTIMENTO TOTAL EM INFRA

| Periodo | Custo Total Acumulado | Receita Total Acumulada | Saldo |
|---------|----------------------|------------------------|-------|
| Meses 1-3 | R$ 2.204 | R$ 4.195 | **+R$ 1.991** |
| Meses 1-6 | R$ 8.171 | R$ 29.629 | **+R$ 21.458** |
| Meses 1-9 | R$ 24.861 | R$ 97.539 | **+R$ 72.678** |
| Meses 1-12 | R$ 52.302 | R$ 241.107 | **+R$ 188.805** |
| Meses 1-18 | R$ 125.787 | R$ 682.827 | **+R$ 557.040** |

---

## 6. BREAK-EVEN E MARCOS FINANCEIROS

| Marco | Quando | Condicao |
|-------|--------|----------|
| **Break-even mensal** | Mes 1 | Com apenas 8 pagantes ja cobre o fixo |
| **R$ 10k MRR** | ~Mes 5-6 | ~120-200 pagantes |
| **R$ 50k MRR** | ~Mes 10-11 | ~800-1.000 pagantes |
| **R$ 100k MRR** | ~Mes 13-14 | ~1.500-1.800 pagantes |
| **R$ 200k MRR** | ~Mes 18 | ~3.000 pagantes |

**Break-even mensal com apenas ~6 clientes pagantes** (R$ 365 fixo / R$ 65 receita media por pagante).

---

## 7. CENARIO PESSIMISTA

E se tudo for mais lento? (metade do crescimento projetado)

| Mes | Usuarios | Pagantes | MRR | Custo Total | Resultado |
|-----|----------|---------|-----|------------|-----------|
| 3 | 50 | 20 | R$ 1.311 | R$ 712 | +R$ 599 |
| 6 | 250 | 100 | R$ 6.555 | R$ 2.260 | +R$ 4.295 |
| 12 | 1.000 | 450 | R$ 29.498 | R$ 8.237 | +R$ 21.261 |
| 18 | 2.500 | 1.200 | R$ 78.660 | R$ 22.185 | +R$ 56.475 |

**Mesmo no cenario pessimista, o negocio e lucrativo desde o mes 1** porque o custo fixo e muito baixo (R$ 365/mes) e a margem por cliente pagante e alta (66-79%).

---

## 8. O QUE MAIS CUSTA NAO E INFRA

O maior custo de um SaaS nao e servidor — e **aquisicao de cliente e tempo do fundador**:

| Custo real | Estimativa mensal | Obs |
|-----------|------------------|-----|
| Tempo do fundador | R$ 5.000-15.000 | Custo de oportunidade |
| Marketing/Ads | R$ 500-3.000 | Instagram, Google, feiras |
| Suporte/CS | R$ 0 -> R$ 3.000 | Quando passar de 200 pagantes |
| Contador | R$ 200-500 | Obrigatorio para CNPJ |
| **Total operacional real** | **R$ 6.000-22.000/mes** | Alem da infra |

**Com infra + operacional, break-even real com ~100-200 pagantes** (R$ 6.500-14.500/mes de receita).

---

## 9. RESUMO

| Metrica | Valor |
|---------|-------|
| Custo fixo de infra | **R$ 365/mes** |
| Custo por lojista gratis | **R$ 0,90/mes** |
| Custo por lojista pagante (medio) | **R$ 10-40/mes** |
| Margem bruta media | **71%** |
| Break-even infra | **~6 pagantes** |
| Break-even real (com operacional) | **~100-200 pagantes** |
| Custo total infra mes 12 (2.800 users) | **R$ 25.000/mes** |
| Custo total infra mes 18 (5.000 users) | **R$ 53.000/mes** |

A infraestrutura **nao e o gargalo**. O stack escolhido (Supabase + Vercel + Evolution API) escala bem e custa pouco. O desafio real e aquisicao de clientes e execucao.
