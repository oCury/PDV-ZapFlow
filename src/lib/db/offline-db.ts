/**
 * Dexie (IndexedDB) database for offline-first sale storage.
 *
 * When navigator.onLine === false, completed sales are stored here.
 * The useOfflineSync hook picks them up and replays them once connectivity
 * is restored, providing seamless background synchronisation.
 */

import Dexie, { type Table } from "dexie";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OfflineSaleItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface OfflinePayment {
  paymentMethod: "CASH" | "CARD" | "PIX" | "LOYALTY";
  amount: number;
}

export type OfflineSaleStatus = "pending" | "syncing" | "synced" | "error";

export interface OfflineSale {
  /** Auto-incremented local ID (Dexie manages this) */
  id?: number;
  /** Stable client-side reference so the UI can track after sync */
  localRef: string;
  totalAmount: number;
  items: OfflineSaleItem[];
  payments: OfflinePayment[];
  customerId?: string;
  tableId?: string;
  loyaltyDiscount?: number;
  notes?: string;
  status: OfflineSaleStatus;
  /** ISO string — when the sale was created offline */
  createdAt: string;
  /** Server-assigned ID after a successful sync */
  serverId?: string;
  /** Last sync error message */
  error?: string;
  retries: number;
}

// ─── Database class ──────────────────────────────────────────────────────────

class PdvDatabase extends Dexie {
  offlineSales!: Table<OfflineSale>;

  constructor() {
    super("pdv-zapflow");

    this.version(1).stores({
      offlineSales: "++id, localRef, status, createdAt",
    });
  }
}

// Export a singleton — safe to call during SSR (returns null on server)
let _db: PdvDatabase | null = null;

export function getOfflineDb(): PdvDatabase | null {
  if (typeof window === "undefined") return null;
  if (!_db) _db = new PdvDatabase();
  return _db;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Persist a sale to IndexedDB for later sync */
export async function queueOfflineSale(
  sale: Omit<OfflineSale, "id" | "status" | "retries" | "createdAt">
): Promise<number> {
  const db = getOfflineDb();
  if (!db) throw new Error("IndexedDB not available");

  return db.offlineSales.add({
    ...sale,
    status: "pending",
    retries: 0,
    createdAt: new Date().toISOString(),
  });
}

/** Fetch all pending/error sales that need to be synced */
export async function getPendingSales(): Promise<OfflineSale[]> {
  const db = getOfflineDb();
  if (!db) return [];
  return db.offlineSales
    .where("status")
    .anyOf(["pending", "error"])
    .toArray();
}

/** Mark a sale as successfully synced */
export async function markSynced(id: number, serverId: string): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  await db.offlineSales.update(id, { status: "synced", serverId });
}

/** Mark a sale as failed with an error message */
export async function markSyncError(id: number, error: string): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  await db.offlineSales.update(id, (sale) => {
    sale.status = "error";
    sale.error = error;
    sale.retries = (sale.retries ?? 0) + 1;
  });
}
