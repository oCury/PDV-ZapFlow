/**
 * Pricing plans for the ZapFlow PDV landing page.
 *
 * ⚠️ PLACEHOLDER CONTENT — prices and feature lists are drafts derived from the
 * product's real capabilities. Replace `priceMonthly`, `priceAnnual` and
 * `features` once the final Basic/Pro contents are defined. Editing this file is
 * the only change needed to update the pricing section.
 */

export interface Plan {
  id: "basic" | "pro";
  name: string;
  tagline: string;
  /** BRL per month, billed monthly */
  priceMonthly: number;
  /** BRL per month, when billed annually */
  priceAnnual: number;
  highlighted?: boolean;
  ctaLabel: string;
  /** Short note under the CTA (e.g. trial, no card) */
  ctaNote: string;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "Para começar a vender com controle de verdade.",
    priceMonthly: 89,
    priceAnnual: 69,
    ctaLabel: "Começar no Basic",
    ctaNote: "7 dias grátis · sem cartão",
    features: [
      "PDV completo (venda presencial)",
      "Catálogo com grade de tamanho e cor",
      "Pagamentos: dinheiro, PIX e cartão",
      "Maquininha Mercado Pago (crédito/débito/PIX)",
      "Controle de estoque por SKU",
      "Cadastro de clientes",
      "Relatórios essenciais de vendas",
      "1 usuário / 1 loja",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para crescer: fidelização, fiscal e automação.",
    priceMonthly: 169,
    priceAnnual: 129,
    highlighted: true,
    ctaLabel: "Quero o Pro",
    ctaNote: "7 dias grátis · cancele quando quiser",
    features: [
      "Tudo do Basic, e mais:",
      "Parcelamento na maquininha",
      "NFC-e (nota fiscal eletrônica)",
      "Follow-up automático no WhatsApp",
      "Cashback e programa de fidelidade",
      "Vale-presente e trocas",
      "Comissão de vendedores",
      "Entregas (motoboy / 99 / Correios)",
      "Relatórios avançados (curva ABC, margem, giro)",
      "Até 3 usuários",
    ],
  },
];
