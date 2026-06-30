import { type Plan } from "@/lib/entitlements";

export const TRIAL_DAYS = 7;
export const SIGNUP_PLANS: Plan[] = ["basic", "pro"]; // enterprise is sales-led
const PASSWORD_MIN = 8;

export function slugify(input: string): string {
  const s = input
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "loja";
}

export interface SignupInput {
  loja: string; name: string; email: string; password: string; plan: string; website?: string;
}
export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateSignup(i: SignupInput): ValidationResult {
  if (i.website) return { ok: false, error: "Cadastro inválido." }; // honeypot
  if (!i.loja?.trim() || !i.name?.trim()) return { ok: false, error: "Informe o nome da loja e o seu nome." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email ?? "")) return { ok: false, error: "E-mail inválido." };
  if ((i.password ?? "").length < PASSWORD_MIN) return { ok: false, error: `Senha precisa de ao menos ${PASSWORD_MIN} caracteres.` };
  if (!(SIGNUP_PLANS as string[]).includes(i.plan)) return { ok: false, error: "Plano inválido." };
  return { ok: true };
}

export type TrialState = "active" | "trialing" | "expired";
export function trialStatus(trialEndsAt: Date | null, now: Date = new Date()): { state: TrialState; daysLeft: number | null } {
  if (!trialEndsAt) return { state: "active", daysLeft: null };
  const ms = trialEndsAt.getTime() - now.getTime();
  if (ms <= 0) return { state: "expired", daysLeft: 0 };
  return { state: "trialing", daysLeft: Math.ceil(ms / 86_400_000) };
}
