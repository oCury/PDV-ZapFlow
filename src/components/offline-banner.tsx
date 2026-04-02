"use client";

import { useState, useEffect } from "react";
import { WifiOff, RefreshCw, CloudUpload } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function OfflineBanner() {
  const [mounted, setMounted] = useState(false);
  const { isOnline, isSyncing, pendingCount, syncNow } = useOfflineSync();

  // Prevent hydration mismatch - only render after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Nothing to show when online and no pending sales (or not mounted yet)
  if (!mounted || (isOnline && pendingCount === 0)) return null;

  return (
    <div
      className={`fixed top-0 inset-x-0 z-[100] flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium transition-all ${
        isOnline
          ? "bg-amber-500/90 text-amber-950"
          : "bg-red-600/90 text-white"
      } backdrop-blur-sm`}
      role="alert"
    >
      <div className="flex items-center gap-2">
        {isOnline ? (
          <CloudUpload size={16} className="shrink-0" />
        ) : (
          <WifiOff size={16} className="shrink-0" />
        )}
        <span>
          {!isOnline
            ? "Sem conexão — vendas sendo salvas localmente"
            : `${pendingCount} venda${pendingCount > 1 ? "s" : ""} aguardando sincronização`}
        </span>
      </div>

      {isOnline && pendingCount > 0 && (
        <button
          onClick={syncNow}
          disabled={isSyncing}
          className="flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-lg bg-black/20 hover:bg-black/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "Sincronizando..." : "Sincronizar"}
        </button>
      )}
    </div>
  );
}
