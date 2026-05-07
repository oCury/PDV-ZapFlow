"use client";

import { useState } from "react";
import { Ticket, Search, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface VoucherInfo {
  code: string;
  balance: number;
  status: string;
  expiresAt: string;
  type: string;
  customerName?: string | null;
}

interface VoucherPaymentInputProps {
  maxAmount: number;
  onVoucherConfirm: (code: string, amount: number) => void;
}

export function VoucherPaymentInput({
  maxAmount,
  onVoucherConfirm,
}: VoucherPaymentInputProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [voucherInfo, setVoucherInfo] = useState<VoucherInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeemAmount, setRedeemAmount] = useState("");

  const lookupVoucher = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setVoucherInfo(null);

    try {
      const res = await fetch(`/api/vouchers/${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Vale não encontrado.");
        return;
      }

      const data = await res.json();

      if (data.status !== "ACTIVE") {
        setError(`Vale não está ativo. Status: ${data.status}`);
        return;
      }

      const expiresAt = new Date(data.expiresAt);
      if (expiresAt < new Date()) {
        setError("Vale expirado.");
        return;
      }

      setVoucherInfo({
        code: data.code,
        balance: data.balance,
        status: data.status,
        expiresAt: data.expiresAt,
        type: data.type,
        customerName: data.customer?.name,
      });

      // Default redeem amount: the lesser of balance and maxAmount
      const defaultAmount = Math.min(data.balance, maxAmount);
      setRedeemAmount(defaultAmount.toFixed(2));
    } catch {
      setError("Erro de conexão ao buscar vale.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupVoucher();
    }
  };

  const handleConfirm = () => {
    if (!voucherInfo) return;

    const amount = parseFloat(redeemAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Valor inválido.");
      return;
    }

    if (amount > voucherInfo.balance) {
      setError(`Valor excede o saldo do vale (R$ ${voucherInfo.balance.toFixed(2)}).`);
      return;
    }

    if (amount > maxAmount) {
      setError(`Valor excede o restante da compra (R$ ${maxAmount.toFixed(2)}).`);
      return;
    }

    onVoucherConfirm(voucherInfo.code, amount);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR");
  };

  return (
    <div className="space-y-4">
      {/* Code input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Ticket
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="VT-XXXX-XXXX"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-pure-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green font-mono text-lg tracking-wider"
          />
        </div>
        <button
          type="button"
          onClick={lookupVoucher}
          disabled={loading || !code.trim()}
          className="touch-target min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:text-slate-400 text-primary-dark transition-colors"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Voucher info */}
      {voucherInfo && (
        <div className="p-4 rounded-xl bg-brand-green/10 border border-brand-green/30 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-brand-green" />
            <span className="text-brand-green font-semibold">Vale válido</span>
            <span
              className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                voucherInfo.type === "EXCHANGE"
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-purple-500/20 text-purple-400"
              }`}
            >
              {voucherInfo.type === "EXCHANGE" ? "Troca" : "Presente"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-400">Saldo:</span>
              <span className="ml-2 text-brand-green font-bold">
                R$ {voucherInfo.balance.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Validade:</span>
              <span className="ml-2 text-pure-white">
                {formatDate(voucherInfo.expiresAt)}
              </span>
            </div>
            {voucherInfo.customerName && (
              <div className="col-span-2">
                <span className="text-slate-400">Cliente:</span>
                <span className="ml-2 text-pure-white">
                  {voucherInfo.customerName}
                </span>
              </div>
            )}
          </div>

          {/* Amount to redeem */}
          <div>
            <label className="text-sm text-slate-400 block mb-1">
              Valor a utilizar (máx. R$ {Math.min(voucherInfo.balance, maxAmount).toFixed(2)})
            </label>
            <input
              type="number"
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
              step="0.01"
              min="0.01"
              max={Math.min(voucherInfo.balance, maxAmount)}
              className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-pure-white focus:outline-none focus:ring-2 focus:ring-brand-green text-lg"
            />
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="w-full touch-target min-h-[44px] bg-brand-green hover:bg-brand-green-hover text-primary-dark font-bold rounded-xl transition-colors"
          >
            Usar Vale
          </button>
        </div>
      )}
    </div>
  );
}
