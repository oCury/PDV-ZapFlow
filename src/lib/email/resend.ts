import { Resend } from "resend";

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is required to send email.");
  return new Resend(key);
}

export async function sendVerificationEmail(p: { to: string; name: string; link: string }): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "no-reply@zapflow.app";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>Confirme seu e-mail</h2>
      <p>Olá ${p.name}, falta um passo para ativar seu teste grátis no PDV ZapFlow.</p>
      <p><a href="${p.link}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirmar e-mail</a></p>
      <p style="color:#64748b;font-size:13px">O link expira em 24 horas. Se o botão não funcionar, copie e cole: <br>${p.link}</p>
    </div>`;
  const { error } = await client().emails.send({ from, to: p.to, subject: "Confirme seu e-mail — PDV ZapFlow", html });
  if (error) throw new Error(`Falha ao enviar e-mail: ${error.message ?? "desconhecido"}`);
}
