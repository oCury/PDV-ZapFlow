"use client";

/**
 * useOfflineSync — Background Sync layer for offline sales
 *
 * Responsibilities:
 *  1. Track online/offline state reactively
 *  2. When connection is restored, replay all pending IndexedDB sales
 *     against /api/sales until they succeed or exhaust retries
 *  3. Expose helper to queue a sale (auto-decides online vs. offline path)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  queueOfflineSale,
  getPendingSales,
  markSynced,
  markSyncError,
  type OfflineSale,
} from "@/lib/db/offline-db";

const MAX_RETRIES = 3;

export interface QueueSalePayload {
  localRef: string;
  totalAmount: number;
  items: OfflineSale["items"];
  payments: OfflineSale["payments"];
  customerId?: string;
  tableId?: string;
  loyaltyDiscount?: number;
  notes?: string;
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncLock = useRef(false);

  // ── Sync engine ────────────────────────────────────────────────────────────

  const syncPendingSales = useCallback(async () => {
    if (syncLock.current || !navigator.onLine) return;
    syncLock.current = true;
    setIsSyncing(true);

    try {
      const pending = await getPendingSales();
      if (pending.length === 0) {
        setPendingCount(0);
        return;
      }

      for (const sale of pending) {
        if (sale.retries >= MAX_RETRIES) continue; // give up after 3 attempts

        try {
          const res = await fetch("/api/sales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              totalAmount: sale.totalAmount,
              items: sale.items,
              payments: sale.payments,
              customerId: sale.customerId,
              tableId: sale.tableId,
              loyaltyDiscount: sale.loyaltyDiscount,
              notes: sale.notes,
            }),
          });

          if (res.ok) {
            const { id } = await res.json();
            await markSynced(sale.id!, id);
          } else {
            const body = await res.json().catch(() => ({}));
            await markSyncError(sale.id!, body.error ?? `HTTP ${res.status}`);
          }
        } catch (err) {
          await markSyncError(
            sale.id!,
            err instanceof Error ? err.message : "Network error"
          );
        }
      }

      // Refresh pending count
      const remaining = await getPendingSales();
      setPendingCount(remaining.length);
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
    }
  }, []);

  // ── Online / offline listeners ─────────────────────────────────────────────

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingSales();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check pending sales on mount
    getPendingSales().then((p) => setPendingCount(p.length));

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingSales]);

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Submit a sale — uses the live API when online, otherwise stores in
   * IndexedDB and returns a synthetic response so the UI stays unblocked.
   */
  const submitSale = useCallback(
    async (
      payload: QueueSalePayload
    ): Promise<{ ok: boolean; serverId?: string; queued?: boolean; error?: string }> => {
      if (navigator.onLine) {
        try {
          const res = await fetch("/api/sales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              totalAmount: payload.totalAmount,
              items: payload.items,
              payments: payload.payments,
              customerId: payload.customerId,
              tableId: payload.tableId,
              loyaltyDiscount: payload.loyaltyDiscount,
              notes: payload.notes,
            }),
          });

          if (res.ok) {
            const body = await res.json();
            return { ok: true, serverId: body.id };
          }
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: body.error ?? "Erro ao processar venda" };
        } catch {
          // Network failure even though navigator.onLine was true — fall through
        }
      }

      // Offline path: persist locally
      await queueOfflineSale(payload);
      setPendingCount((c) => c + 1);
      return { ok: true, queued: true };
    },
    []
  );

  return {
    isOnline,
    isSyncing,
    pendingCount,
    submitSale,
    syncNow: syncPendingSales,
  };
}
