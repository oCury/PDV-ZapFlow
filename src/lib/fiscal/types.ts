/**
 * Fiscal Module — Type Definitions
 *
 * Models the data structures required by Brazilian fiscal APIs
 * (FocusNFe / PlugNotas) for NFC-e (Nota Fiscal de Consumidor Eletrônica).
 *
 * These are boilerplate interfaces that need to be filled with real CNPJ,
 * NCM codes, CST tables, and API credentials before going to production.
 */

// ─── Issuer ──────────────────────────────────────────────────────────────────

export interface FiscalIssuer {
  /** Company name (Razão Social) */
  name: string;
  /** CNPJ (14 digits, no punctuation) */
  cnpj: string;
  /** State registration number (Inscrição Estadual) */
  ie: string;
  /** CRT — Código de Regime Tributário: 1=Simples, 3=Lucro Real */
  crt: 1 | 2 | 3;
  address: {
    street: string;
    number: string;
    district: string;
    city: string;
    /** 2-letter state code, e.g. "SP" */
    state: string;
    zipCode: string;
    /** IBGE city code */
    cityCode: string;
  };
}

// ─── Customer on the receipt ──────────────────────────────────────────────────

export interface FiscalConsumer {
  /** CPF (11 digits) or CNPJ (14 digits) — optional by law */
  document?: string;
  name?: string;
}

// ─── Product line ─────────────────────────────────────────────────────────────

export interface FiscalProduct {
  /** Internal product code */
  code: string;
  description: string;
  /** NCM — Nomenclatura Comum do Mercosul (8-digit fiscal code) */
  ncm: string;
  /** CEST — Código Especificador da Substituição Tributária (optional) */
  cest?: string;
  cfop: string;     // e.g. "5102"
  unit: string;     // e.g. "UN", "KG"
  quantity: number;
  unitValue: number;
  totalValue: number;

  /** ICMS tax group */
  icms: {
    origin: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    /** CST or CSOSN depending on CRT */
    cst: string;
    /** e.g. "40" = isentas, "41" = não tributadas */
    modBC?: string;
    bc?: number;
    rate?: number;
    value?: number;
  };

  /** PIS / COFINS */
  pis: { cst: string; bc: number; rate: number; value: number };
  cofins: { cst: string; bc: number; rate: number; value: number };
}

// ─── Payment on the receipt ───────────────────────────────────────────────────

export interface FiscalPayment {
  /** 01=Dinheiro, 03=Cartão Crédito, 04=Cartão Débito, 05=Crédito Loja, 17=PIX */
  method: "01" | "03" | "04" | "05" | "17" | "99";
  amount: number;
}

// ─── Full NFC-e payload ───────────────────────────────────────────────────────

export interface NfcePayload {
  /** 1=NF-e, 65=NFC-e */
  model: 65;
  /** 1=Saída (always for NFC-e) */
  nature: string;         // "Venda ao consumidor"
  issuer: FiscalIssuer;
  consumer?: FiscalConsumer;
  products: FiscalProduct[];
  payments: FiscalPayment[];
  totalProducts: number;
  totalNote: number;
  /** Optional discount value */
  discount?: number;
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface FiscalApiResponse {
  status: "autorizado" | "erro" | "cancelado" | "processando";
  /** Chave de acesso (44 digits) */
  accessKey?: string;
  /** QR code URL for DANFE NFC-e */
  qrCodeUrl?: string;
  /** PDF download URL */
  danfeUrl?: string;
  /** Protocol number */
  protocol?: string;
  errors?: { code: string; message: string }[];
}

// ─── Webhook event ────────────────────────────────────────────────────────────

export interface FiscalWebhookEvent {
  event: "nfce.authorized" | "nfce.error" | "nfce.cancelled";
  referenceId: string; // our internal sale ID
  accessKey?: string;
  qrCodeUrl?: string;
  danfeUrl?: string;
  errors?: { code: string; message: string }[];
  timestamp: string;
}
