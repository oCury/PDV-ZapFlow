"use client";

import { useState, useEffect } from "react";
import { X, Wallet, LogIn, LogOut, Banknote } from "lucide-react";
import { NumericKeypad } from "./numeric-keypad";

interface ShiftInfo {
  id: string;
  openedAt: string;
  openingCash: number;
  withdrawals: number;
}

interface CashRegisterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CashRegisterDrawer({ isOpen, onClose }: CashRegisterDrawerProps) {
  const [status, setStatus] = useState<{ hasOpenShift: boolean; shift: ShiftInfo | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"idle" | "open" | "close" | "withdrawal">("idle");
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/cash-register");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    if (isOpen) fetchStatus();
  }, [isOpen]);

  const handleOpenShift = async () => {
    const cash = parseFloat(openingCash) || 0;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cash-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "OPEN", openingCash: cash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao abrir turno");
      await fetchStatus();
      setAction("idle");
      setOpeningCash("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    const cash = parseFloat(closingCash);
    if (!status?.shift || isNaN(cash)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cash-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLOSE",
          shiftId: status.shift.id,
          closingCash: cash,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao fechar turno");
      await fetchStatus();
      setAction("idle");
      setClosingCash("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawal = async () => {
    const amount = parseFloat(withdrawalAmount);
    if (!status?.shift || isNaN(amount) || amount <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cash-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "WITHDRAWAL",
          shiftId: status.shift.id,
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar sangria");
      await fetchStatus();
      setAction("idle");
      setWithdrawalAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-800 border-l border-slate-600 z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-600">
          <div className="flex items-center gap-2">
            <Wallet size={24} className="text-brand-green" />
            <h2 className="font-bold text-white text-lg">Caixa</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {status === null ? (
            <p className="text-slate-400">Carregando...</p>
          ) : (
            <>
              {status.hasOpenShift && status.shift ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-brand-green/10 border border-brand-green/30">
                    <p className="text-sm text-slate-300">Turno aberto</p>
                    <p className="text-lg font-bold text-brand-green">
                      Abertura: R$ {status.shift.openingCash.toFixed(2)}
                    </p>
                    <p className="text-sm text-slate-400">
                      Sangrias: R$ {status.shift.withdrawals.toFixed(2)}
                    </p>
                  </div>

                  {action === "withdrawal" ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-300">Valor da sangria</p>
                      <NumericKeypad
                        value={withdrawalAmount}
                        onChange={setWithdrawalAmount}
                        onConfirm={handleWithdrawal}
                      />
                    </div>
                  ) : action === "close" ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-300">Valor no caixa ao fechar</p>
                      <NumericKeypad
                        value={closingCash}
                        onChange={setClosingCash}
                        onConfirm={handleCloseShift}
                      />
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAction("withdrawal")}
                        className="touch-target min-h-[48px] flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium"
                      >
                        <Banknote size={20} />
                        Sangria
                      </button>
                      <button
                        type="button"
                        onClick={() => setAction("close")}
                        className="touch-target min-h-[48px] flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600/80 hover:bg-amber-600 text-white font-medium"
                      >
                        <LogOut size={20} />
                        Fechar Turno
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-400">Nenhum turno aberto</p>
                  {action === "open" ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-300">Valor de abertura</p>
                      <NumericKeypad
                        value={openingCash}
                        onChange={setOpeningCash}
                        onConfirm={handleOpenShift}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAction("open")}
                      className="touch-target w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark font-bold"
                    >
                      <LogIn size={22} />
                      Abrir Turno
                    </button>
                  )}
                </div>
              )}

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
              {loading && (
                <p className="text-slate-400 text-sm">Processando...</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
