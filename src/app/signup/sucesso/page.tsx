"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function Sucesso() {
  const order = useSearchParams().get("order");
  const router = useRouter();
  const [msg, setMsg] = useState("Confirmando seu pagamento…");

  useEffect(() => {
    if (!order) { setMsg("Pedido inválido."); return; }
    let tries = 0;
    const tick = async () => {
      const r = await fetch(`/api/signup/status?order=${order}`).then((x) => x.json()).catch(() => ({ status: "error" }));
      if (r.status === "ready") { router.replace("/"); router.refresh(); return; }
      if ((r.status === "pending" || r.status === "error") && tries++ < 15) { setTimeout(tick, 2000); return; }
      setMsg("Pagamento em processamento. Você receberá acesso em instantes — se já pagou, tente entrar em alguns minutos.");
    };
    tick();
  }, [order, router]);

  return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}><p>{msg}</p></main>;
}

export default function Page() { return <><Suspense><Sucesso /></Suspense></>; }
