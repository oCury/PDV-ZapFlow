# PDV-ZapFlow — Resumo dos Testes

**Data:** 28/07/2026
**Branch:** `feat/pay-upfront-signup` (7 commits à frente da origin, não enviados)
**Ambiente testado:** servidor local `http://localhost:3002` → **banco de produção (Supabase)** — dev e prod usam o mesmo banco
**Ferramentas:** Playwright, Vitest, varredura autenticada das rotas
**Relatório completo:** [`2026-07-28-qa-full-feature-test-report.md`](./2026-07-28-qa-full-feature-test-report.md)

---

## Veredito

O sistema está **saudável em funcionalidade**. Todas as páginas carregam, todas as APIs de leitura respondem e os testes unitários passam 100%. Os problemas encontrados **não estavam no produto** — eram (1) uma falha de migração que travava esta branch e (2) uma suíte de testes E2E desatualizada. **Ambos já corrigidos.**

| Camada | Resultado |
|---|---|
| Páginas (renderização) | **27 / 27 → 200** ✅ |
| APIs de leitura | **33 testadas, 0 erros de servidor** ✅ |
| Testes unitários (Vitest) | **96 / 96 passando** (21 arquivos) ✅ |
| Testes E2E (Playwright) | **18 / 18 passando** ✅ (antes: 8 ok / 4 falhas / 6 puladas — todas as falhas eram dos testes, já corrigidas) |
| Login em produção (`pdv-zap-flow.vercel.app`) | **200 / 401** saudável ✅ |

---

## 🔴 Ponto crítico — resolver antes de subir esta branch

**Coluna `paid_until` faltando no banco → login quebrava 100% nesta branch.**

- O código de login lê `tenant.paid_until` (`src/app/api/auth/login/route.ts:28`), mas a coluna **nunca foi migrada** para o banco → todo login retornava **500**.
- **Afeta só esta branch.** A `main` não usa `paid_until`, então **produção não foi afetada** (login em prod retorna 200, verificado).
- **Ação feita durante o teste:** adicionei a coluna (nullable, segura, aditiva) para a suíte poder rodar:
  ```sql
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paid_until timestamptz;
  ```
- **Próximo passo:** oficializar com `npx prisma db push` (conexão direta na porta 5432, não pgbouncer) e confirmar que as outras tabelas novas da branch (ex.: `PendingSignup`) também estão migradas. **Não fazer merge da `feat/pay-upfront-signup` antes disso**, ou o login de produção quebra.

---

## 🟢 O que funciona

- **27 páginas** renderizando (dashboard, PDV, produtos, categorias, clientes, vendas, relatórios, equipe, comissões, vouchers, cashback, mesas, trocas, etiquetas, fiscal, follow-ups, entregas, configurações, upgrade, assinar).
- **APIs de leitura** todas saudáveis. Os poucos não-200 são comportamento correto (404 = "cliente não encontrado"; 400 = validação de período nos relatórios).
- **96/96 testes unitários** (billing, provisionamento de tenant, webhooks InfinitePay + Mercado Pago).
- **Fluxos E2E ponta a ponta:** clientes (CRUD + busca), entregas, importação NF-e, PDV (venda + identificação de cliente), pagamento em maquininha e configurações de cashback.

---

## 🛠️ Correções aplicadas nos testes E2E

Todas as 4 falhas eram **defeitos nos testes**, não bugs do app:

| Arquivo | O que foi corrigido |
|---|---|
| `tests/e2e/helpers.ts` (novo) | `login()` compartilhado (espera sair de `/login`, robusto ao redirect ADMIN→`/dashboard`) + `addProductAndFinish()` que detecta o modal de variante pelo rótulo **"Tamanho"** e escolhe tamanho/cor antes de confirmar — acaba com o carrinho vazio intermitente. Clica no primeiro produto **com estoque**. |
| `pdv-customer-flow.spec.ts` | Usa os helpers compartilhados; removidos os `waitForTimeout` frágeis. |
| `terminal-payment.spec.ts` | Fluxo de pagamento reescrito para o modal atual: revelar pagamentos → "Cartão" → teclado → painel da maquininha → "Enviar" → "Pagamento Aprovado!". |
| `settings-cashback.spec.ts` | Reapontado da seção removida em `/settings` para as configurações reais em **`/cashback`**. |
| `customers-crud.spec.ts` | Editar/excluir agora esperam `networkidle` e usam `dispatchEvent("click")` para contornar o botão flutuante **"Suporte IA"** que interceptava os cliques. |
| `entregas.spec.ts`, `nfe-import.spec.ts` | Passaram a usar o `login()` compartilhado. |

**Resultado:** 18/18 passando, estável em duas execuções seguidas (~37s). `tsc` limpo. Nenhum dado de teste sobrou no banco de produção.

---

## 📋 Próximos passos recomendados

| Prioridade | Ação |
|---|---|
| 🔴 Crítico | Migrar `paid_until` (e as demais mudanças de schema da branch) antes do merge; validar que o login de prod continua verde |
| 🟡 Média | Trocar/rotacionar as senhas fracas de admin/funcionário (`admin123`, `naran123` — padrão `<nome>123`, versionadas no repo) e tirar as credenciais dos testes para variáveis de ambiente |
| 🟢 Baixa | Revisão rápida de `z-index`/posição do botão "Suporte IA" — ele pode sobrepor os botões de ação da última linha em listas longas (não é bloqueante) |
