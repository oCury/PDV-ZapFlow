"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Verify() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "error">("loading");
  const [msg, setMsg] = useState("Confirmando seu e-mail...");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setState("error"); setMsg("Link inválido."); return; }
    fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        if (r.ok) { router.replace("/"); router.refresh(); return; }
        const d = await r.json().catch(() => ({}));
        setState("error"); setMsg(d.error ?? "Não foi possível confirmar.");
      })
      .catch(() => { setState("error"); setMsg("Erro de conexão."); });
  }, [params, router]);
  return (
    <div>
      <p>{msg}</p>
      {state === "error" && <a href="/signup" style={{ color: "#16a34a", fontWeight: 600 }}>Voltar ao cadastro</a>}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <Suspense><Verify /></Suspense>
    </main>
  );
}
