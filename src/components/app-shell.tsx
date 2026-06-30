"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { OfflineBanner } from "./offline-banner";
import { LowStockAlert } from "./low-stock-alert";
import { SupportChat } from "./support-chat";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isPdvPage = pathname === "/pdv";

  const [trial, setTrial] = useState<{ state: string; daysLeft: number | null } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.trial && setTrial(d.trial))
      .catch(() => {});
  }, []);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden theme-bg-base">
      <OfflineBanner />
      {/* Sidebar: desktop only */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/*
       * PDV page: no padding, no overflow-y-auto on desktop — the PDV manages
       *           its own internal scroll regions to achieve full-height split view.
       * Other pages: normal padded scrollable layout with mobile bottom-nav clearance.
       */}
      <main
        className={
          isPdvPage
            ? "flex-1 overflow-hidden theme-bg-base"
            : "flex-1 overflow-y-auto overflow-x-hidden theme-bg-base p-6 pb-24 md:pb-0"
        }
      >
        {trial?.state === "trialing" && trial.daysLeft !== null && trial.daysLeft <= 3 && (
          <div className="bg-amber-500/15 text-amber-800 text-sm text-center py-2 px-4">
            Seu teste grátis termina em {trial.daysLeft} {trial.daysLeft === 1 ? "dia" : "dias"}.{" "}
            <a href="/assinar" className="underline font-semibold">Assinar</a>
          </div>
        )}
        {children}
      </main>

      {/* Bottom Nav: mobile only */}
      <BottomNav />

      {/* Low Stock Alert - shown on all pages */}
      <LowStockAlert />

      {/* AI Support Chat - floating widget */}
      <SupportChat />
    </div>
  );
}
