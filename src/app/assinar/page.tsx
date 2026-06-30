"use client";
const WHATSAPP_URL = "https://wa.me/5513997164200";
export default function AssinarPage() {
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold">Seu teste grátis terminou</h1>
      <p className="text-slate-600">Seus dados estão salvos. Assine para continuar usando o PDV ZapFlow com tudo que você já configurou.</p>
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand-green px-6 py-3 font-semibold text-white">Assinar pelo WhatsApp</a>
      <button onClick={logout} className="text-sm text-slate-500 underline">Sair</button>
    </main>
  );
}
