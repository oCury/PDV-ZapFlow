"use client";

import { useState, useEffect, useRef } from "react";
import {
  Banknote,
  CreditCard,
  QrCode,
  Loader2,
  CheckCircle,
  XCircle,
  CircleDollarSign,
  Plus,
  Trash2,
  Printer,
  X,
  Ticket,
} from "lucide-react";
import type { CartItem } from "@/lib/validations/pos";
import type { PaymentSplit } from "@/lib/validations/pos";
import { NumericKeypad } from "./numeric-keypad";
import { ReceiptPrint } from "./receipt-print";
import { VoucherPaymentInput } from "./voucher-payment-input";
import { TerminalPaymentPanel } from "./terminal-payment-panel";

interface SelectedCustomer {
  id: string;
  name?: string | null;
  loyalty_points?: number;
}

interface MultiPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  cartItems: CartItem[];
  onPaymentSuccess: () => void;
  selectedCustomer?: SelectedCustomer | null;
}

type PaymentMethod = "CASH" | "CARD" | "PIX" | "VOUCHER";
type PaymentStatus = "IDLE" | "PROCESSING" | "SUCCESS" | "FAILED";

interface PaymentWithVoucher extends PaymentSplit {
  voucherCode?: string;
}

const PAYMENT_METHODS: { key: PaymentMethod; icon: typeof Banknote; label: string }[] = [
  { key: "CASH", icon: Banknote, label: "Dinheiro" },
  { key: "CARD", icon: CreditCard, label: "Cartão" },
  { key: "PIX", icon: QrCode, label: "PIX" },
  { key: "VOUCHER", icon: Ticket, label: "Vale" },
];

function buildItemsPayload(cartItems: CartItem[]) {
  return cartItems.map((item) => ({
    productId: item.productId ?? item.id,
    variantId: item.variantId,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    size: item.size,
    color: item.color,
  }));
}

export function MultiPaymentModal({
  isOpen,
  onClose,
  totalAmount,
  cartItems,
  onPaymentSuccess,
  selectedCustomer,
}: MultiPaymentModalProps) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("IDLE");
  const [payments, setPayments] = useState<PaymentWithVoucher[]>([]);
  const [amountReceived, setAmountReceived] = useState("");
  const [change, setChange] = useState(0);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [addPaymentMethod, setAddPaymentMethod] = useState<PaymentMethod | null>(null);
  const [addPaymentAmount, setAddPaymentAmount] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCep, setShippingCep] = useState("");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Shipping fields are only sent when a delivery method is chosen (RETIRADA/none = no delivery).
  const shippingFields = shippingMethod
    ? {
        shippingMethod,
        shippingAddress: shippingAddress.trim() || undefined,
        shippingCep: shippingCep.trim() || undefined,
      }
    : {};

  const paidSoFar = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = totalAmount - paidSoFar;
  const isFullyPaid = remaining <= 0.01;
  const isOverpaid = paidSoFar > totalAmount + 0.01;

  useEffect(() => {
    if (!isOpen) {
      setPaymentStatus("IDLE");
      setPayments([]);
      setAmountReceived("");
      setChange(0);
      setIntentId(null);
      setSaleId(null);
      setChargeId(null);
      setErrorMessage(null);
      setShowAddPayment(false);
      setAddPaymentMethod(null);
      setAddPaymentAmount("");
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (paymentStatus === "PROCESSING" && chargeId) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/checkout/terminal-charge/${chargeId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.approved) {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;
              setPaymentStatus("SUCCESS");
            } else if (data.status === "DECLINED" || data.status === "ERROR") {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;
              setErrorMessage("Pagamento recusado. Tente outro cartão ou método.");
              setPaymentStatus("FAILED");
            }
          }
        } catch {
          // intentionally ignored — polling errors are non-fatal
        }
      }, 3000);
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [paymentStatus, chargeId]);

  const addPayment = (method: PaymentMethod, amount: number, voucherCode?: string) => {
    if (amount <= 0) return;
    const entry: PaymentWithVoucher = { paymentMethod: method, amount };
    if (voucherCode) {
      entry.voucherCode = voucherCode;
    }
    setPayments((prev) => [...prev, entry]);
    if (method === "CASH") {
      setAmountReceived(amount.toString());
      // Calculate change for cash payments
      const changeAmount = amount - totalAmount;
      setChange(changeAmount > 0 ? changeAmount : 0);
    }
    setShowAddPayment(false);
    setAddPaymentMethod(null);
    setAddPaymentAmount("");
  };

  const removePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCashPayment = async (receivedOverride?: number) => {
    const received = receivedOverride ?? parseFloat(amountReceived);
    if (isNaN(received) || received < totalAmount) return;

    setPaymentStatus("PROCESSING");
    setErrorMessage(null);

    const payload: Record<string, unknown> = {
      totalAmount,
      paymentMethod: "CASH",
      items: buildItemsPayload(cartItems),
      customerId: selectedCustomer?.id,
      ...shippingFields,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || "Venda não registrada. Tente novamente.");
        setPaymentStatus("FAILED");
        return;
      }
      setPaymentStatus("SUCCESS");
      setChange(received - totalAmount);
      setAmountReceived(received.toString());
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setErrorMessage(
          "A operação demorou muito. Tente novamente ou use outro método de pagamento."
        );
      } else {
        setErrorMessage("Sem conexão com o servidor. Verifique sua internet.");
      }
      setPaymentStatus("FAILED");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleTerminalSend = async ({
    terminalId,
    method,
    installments,
  }: { terminalId: string; method: "CREDIT" | "DEBIT" | "PIX"; installments: number }) => {
    setPaymentStatus("PROCESSING");
    setErrorMessage(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch("/api/checkout/terminal-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terminalId,
          method,
          installments,
          totalAmount,
          items: buildItemsPayload(cartItems),
          customerId: selectedCustomer?.id,
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(data.error || "Erro ao enviar para a maquininha.");
        setPaymentStatus("FAILED");
        return;
      }
      setChargeId(data.chargeId);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setErrorMessage(
          "A operação demorou muito. Tente novamente ou use outro método de pagamento."
        );
      } else {
        setErrorMessage("Sem conexão com a maquininha. Verifique a internet.");
      }
      setPaymentStatus("FAILED");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleMultiPayment = async () => {
    if (!isFullyPaid || isOverpaid) return;

    const hasCard = payments.some((p) => p.paymentMethod === "CARD");
    const hasPix = payments.some((p) => p.paymentMethod === "PIX");

    if (hasCard || hasPix) {
      setErrorMessage("Pagamento misto com Cartão/PIX em breve. Use um único método por venda.");
      return;
    }

    setPaymentStatus("PROCESSING");
    setErrorMessage(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount,
          items: buildItemsPayload(cartItems),
          payments,
          customerId: selectedCustomer?.id,
          ...shippingFields,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || "Venda não registrada. Tente novamente.");
        setPaymentStatus("FAILED");
        return;
      }
      setPaymentStatus("SUCCESS");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setErrorMessage(
          "A operação demorou muito. Tente novamente ou use outro método de pagamento."
        );
      } else {
        setErrorMessage("Sem conexão com o servidor. Verifique sua internet.");
      }
      setPaymentStatus("FAILED");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handlePixPayment = () => {
    setErrorMessage(
      "Pagamento via PIX ainda não disponível nesta versão. Use Dinheiro, Cartão ou Vale."
    );
  };

  const handleConfirmPayment = () => {
    if (payments.length > 1) {
      handleMultiPayment();
    } else if (payments.length === 1) {
      const p = payments[0];
      if (p.paymentMethod === "CASH") {
        setAmountReceived(p.amount.toString());
        setChange(p.amount - totalAmount);
        handleCashPayment(p.amount);
      } else {
        handlePixPayment();
      }
    } else {
      setErrorMessage("Adicione ao menos um pagamento.");
    }
  };

  if (!isOpen) return null;

  const renderContent = () => {
    switch (paymentStatus) {
      case "IDLE":
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">
              Total: R$ {totalAmount.toFixed(2)}
            </h2>

            {/* Customer Info */}
            {selectedCustomer && (
              <div className="p-3 rounded-lg bg-brand-green/10 border border-brand-green/30">
                <p className="text-sm text-brand-green font-medium">
                  Cliente: {selectedCustomer.name || `ID: ${selectedCustomer.id.slice(0, 8)}`}
                </p>
                {selectedCustomer.loyalty_points !== undefined && selectedCustomer.loyalty_points > 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    Pontos de fidelidade: {selectedCustomer.loyalty_points}
                  </p>
                )}
              </div>
            )}

            {/* Delivery / shipping */}
            <div className="space-y-2">
              <label className="text-sm text-slate-300 font-medium">Entrega</label>
              <select
                value={shippingMethod}
                onChange={(e) => setShippingMethod(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40"
              >
                <option value="">Retirada na loja (sem entrega)</option>
                <option value="MOTOBOY">Motoboy</option>
                <option value="CORREIOS">Correios</option>
                <option value="TRANSPORTADORA">Transportadora</option>
              </select>
              {shippingMethod && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Endereço de entrega"
                      className="col-span-2 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40"
                    />
                    <input
                      value={shippingCep}
                      onChange={(e) => setShippingCep(e.target.value)}
                      placeholder="CEP"
                      className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Esta venda aparecerá em <span className="text-brand-green">Entregas</span>.
                  </p>
                </>
              )}
            </div>

            {/* Payment splits */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">Pagamentos</span>
                {!showAddPayment && (
                  <button
                    type="button"
                    onClick={() => setShowAddPayment(true)}
                    className="touch-target min-h-[44px] px-3 flex items-center gap-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm"
                  >
                    <Plus size={18} />
                    Adicionar
                  </button>
                )}
              </div>

              {payments.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-700"
                >
                  <div className="flex items-center gap-2">
                    {PAYMENT_METHODS.find((m) => m.key === p.paymentMethod)?.icon &&
                      (() => {
                        const Icon = PAYMENT_METHODS.find((m) => m.key === p.paymentMethod)!.icon;
                        return <Icon size={20} className="text-brand-green" />;
                      })()}
                    <span className="text-white font-medium">
                      {PAYMENT_METHODS.find((m) => m.key === p.paymentMethod)?.label}
                      {p.voucherCode && (
                        <span className="ml-1 text-xs text-slate-400 font-mono">
                          ({p.voucherCode})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-brand-green font-bold">
                      R$ {p.amount.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePayment(i)}
                      className="touch-target min-w-[36px] min-h-[36px] flex items-center justify-center rounded text-slate-400 hover:text-red-400"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}

              {showAddPayment && (
                <div className="p-4 rounded-xl bg-slate-700/80 border border-slate-600 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setAddPaymentMethod(m.key)}
                        className={`touch-target min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors ${
                          addPaymentMethod === m.key
                            ? "bg-brand-green text-primary-dark"
                            : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                        }`}
                      >
                        <m.icon size={22} />
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {addPaymentMethod && addPaymentMethod !== "VOUCHER" && (
                    <NumericKeypad
                      value={addPaymentAmount}
                      onChange={setAddPaymentAmount}
                      onConfirm={() => {
                        const amt = parseFloat(addPaymentAmount);
                        if (!isNaN(amt) && amt > 0) {
                          addPayment(addPaymentMethod, amt);
                        }
                      }}
                    />
                  )}
                  {addPaymentMethod === "VOUCHER" && (
                    <VoucherPaymentInput
                      maxAmount={remaining > 0 ? remaining : totalAmount}
                      onVoucherConfirm={(voucherCode, amount) => {
                        addPayment("VOUCHER", amount, voucherCode);
                      }}
                    />
                  )}
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Pago:</span>
                <span className={isFullyPaid ? "text-brand-green font-bold" : "text-slate-300"}>
                  R$ {paidSoFar.toFixed(2)}
                </span>
              </div>
              {remaining > 0.01 && (
                <p className="text-amber-400 text-sm">Faltam R$ {remaining.toFixed(2)}</p>
              )}
              {/* Show change for cash overpayment */}
              {payments.some(p => p.paymentMethod === "CASH") && paidSoFar > totalAmount && (
                <p className="text-lg font-bold text-brand-green">
                  Troco: R$ {(paidSoFar - totalAmount).toFixed(2)}
                </p>
              )}
            </div>

            {/* Single payment: Cash amount received */}
            {payments.length === 1 && payments[0].paymentMethod === "CASH" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <CircleDollarSign size={16} />
                  Valor Recebido
                </label>
                <NumericKeypad
                  value={amountReceived}
                  onChange={(v) => {
                    setAmountReceived(v);
                    const r = parseFloat(v);
                    setChange(isNaN(r) ? 0 : r - totalAmount);
                  }}
                />
                {change >= 0 && (
                  <p className="text-lg font-bold text-brand-green">
                    Troco: R$ {change.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Single payment: Terminal (CARD) */}
            {payments.length === 1 && payments[0].paymentMethod === "CARD" && (
              <TerminalPaymentPanel
                totalAmount={totalAmount}
                onSend={handleTerminalSend}
              />
            )}

            {errorMessage && (
              <p className="text-red-400 text-sm">{errorMessage}</p>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={
                  payments.length === 0 ||
                  (payments.length === 1 && payments[0].paymentMethod === "CARD") ||
                  (payments.length === 1 &&
                    payments[0].paymentMethod === "CASH" &&
                    (parseFloat(amountReceived) || 0) < totalAmount)
                }
                className="w-full touch-target min-h-[56px] bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed text-primary-dark font-bold text-lg rounded-xl transition-colors"
              >
                {payments.length > 1 ? "Pagar" : `Pagar com ${payments[0] ? PAYMENT_METHODS.find((m) => m.key === payments[0].paymentMethod)?.label : "..."}`}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full touch-target min-h-[48px] flex items-center justify-center gap-2 rounded-xl border-2 border-slate-600 text-slate-300 hover:border-slate-500 hover:text-slate-200 font-semibold transition-colors"
              >
                <X size={18} />
                Sair do Pagamento
              </button>
            </div>
          </div>
        );

      case "PROCESSING":
        return (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-800 rounded-xl text-white">
            <Loader2 size={64} className="animate-spin text-brand-green mb-6" />
            <h2 className="text-2xl font-bold mb-3">Processando Pagamento</h2>
            <p className="text-slate-300">
              {chargeId
                ? "Aproxime ou insira o cartão na maquininha."
                : "Registrando venda..."}
            </p>
            {intentId && (
              <p className="text-sm text-slate-500 mt-4">ID: {intentId}</p>
            )}
            {chargeId && (
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/checkout/terminal-charge/${chargeId}/cancel`, { method: "POST" });
                  setPaymentStatus("IDLE");
                  setChargeId(null);
                }}
                className="mt-6 touch-target min-h-[48px] px-6 rounded-xl border-2 border-slate-600 text-slate-300 hover:text-slate-200"
              >
                Cancelar cobrança
              </button>
            )}
          </div>
        );

      case "SUCCESS":
        return (
          <>
            <ReceiptPrint
              items={cartItems}
              total={totalAmount}
              payments={payments.map((p) => ({
                method: p.paymentMethod,
                amount: p.amount,
              }))}
              change={change}
              customerName={selectedCustomer?.name ?? undefined}
              printedAt={new Date()}
            />
            <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-800 rounded-xl text-white">
              <CheckCircle size={64} className="text-brand-green mb-6" />
              <h2 className="text-2xl font-bold mb-3">Pagamento Aprovado!</h2>
              <p className="text-slate-300">Obrigado pela preferência.</p>
              {change > 0 && (
                <p className="text-xl font-bold text-brand-green mt-4">
                  Troco: R$ {change.toFixed(2)}
                </p>
              )}
              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="touch-target min-h-[52px] px-6 flex items-center gap-2 rounded-2xl bg-slate-600 hover:bg-slate-500 text-white font-semibold"
                >
                  <Printer size={20} />
                  Imprimir
                </button>
                <button
                  type="button"
                  onClick={onPaymentSuccess}
                  className="touch-target min-h-[52px] px-8 bg-brand-green hover:bg-brand-green-hover text-primary-dark font-bold rounded-2xl transition-colors"
                >
                  Nova Venda
                </button>
              </div>
            </div>
          </>
        );

      case "FAILED":
        return (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-red-500/20 border border-red-500/50 rounded-xl text-white">
            <XCircle size={64} className="text-red-400 mb-6" />
            <h2 className="text-2xl font-bold mb-3">Pagamento Recusado</h2>
            <p className="text-slate-300">
              {errorMessage || "Tente novamente ou escolha outro método."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button
                type="button"
                onClick={() => {
                  setPaymentStatus("IDLE");
                  setErrorMessage(null);
                }}
                className="touch-target min-h-[52px] px-8 bg-white text-red-700 hover:bg-gray-100 font-bold rounded-xl transition-colors"
              >
                Tentar Novamente
              </button>
              <button
                type="button"
                onClick={onClose}
                className="touch-target min-h-[52px] px-8 flex items-center justify-center gap-2 rounded-xl border-2 border-slate-600 text-slate-300 hover:border-slate-500 hover:text-slate-200 font-semibold transition-colors"
              >
                <X size={18} />
                Sair
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canClose = paymentStatus === "IDLE" || paymentStatus === "FAILED" || paymentStatus === "SUCCESS";

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="relative bg-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-lg border border-slate-600 max-h-[90vh] overflow-y-auto">
        {canClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 touch-target min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title="Sair do pagamento"
          >
            <X size={22} />
          </button>
        )}
        {renderContent()}
      </div>
    </div>
  );
}
