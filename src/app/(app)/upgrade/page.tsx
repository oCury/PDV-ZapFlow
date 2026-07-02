import Link from "next/link";

const FEATURE_LABELS: Record<string, string> = {
  "fiscal.nfce": "Emissão de NFC-e",
  whatsapp: "Follow-up por WhatsApp",
  loyalty: "Fidelidade & cashback",
  vouchers: "Vale-presente & trocas",
  commissions: "Comissão de vendedores",
  deliveries: "Entregas",
  labels: "Etiquetas / código de barras",
  tables: "Mesas & comandas",
  "reports.advanced": "Relatórios avançados",
  multistore: "Multi-loja",
};

const WHATSAPP_URL = "https://wa.me/5513997164200";

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature } = await searchParams;
  const label = feature ? FEATURE_LABELS[feature] ?? feature : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold">
        {label
          ? `${label} está disponível em um plano superior`
          : "Recurso disponível em um plano superior"}
      </h1>
      <p className="text-slate-600">
        Seu plano atual não inclui este recurso. Fale com a gente para liberar e
        aproveitar tudo que o PDV ZapFlow oferece.
      </p>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-brand-green px-6 py-3 font-semibold text-white"
      >
        Falar no WhatsApp
      </a>
      <Link href="/" className="text-sm text-slate-500 underline">
        Voltar ao início
      </Link>
    </main>
  );
}
