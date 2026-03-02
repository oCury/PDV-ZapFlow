import { useState, useEffect, useRef } from "react";
import {
  Banknote,
  CreditCard,
  QrCode,
  Loader2,
  CheckCircle,
  XCircle,
  CircleDollarSign,
} from "lucide-react";
import type { CartItem } from "@/lib/validations/pos";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  cartItems: CartItem[];
  onPaymentSuccess: () => void;
}

type PaymentMethod = "CASH" | "CARD" | "PIX";
type PaymentStatus = "IDLE" | "PROCESSING" | "SUCCESS" | "FAILED";

const DEVICE_ID = process.env.NEXT_PUBLIC_MERCADOPAGO_DEVICE_ID || "";

export function PaymentModal({
  isOpen,
  onClose,
  totalAmount,
  cartItems,
  onPaymentSuccess,
}: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("IDLE");
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [change, setChange] = useState<number>(0);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedMethod(null);
      setPaymentStatus("IDLE");
      setAmountReceived("");
      setChange(0);
      setIntentId(null);
      setSaleId(null);
      setErrorMessage(null);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (paymentStatus === "PROCESSING" && saleId) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/sales/${saleId}/status`);
          if (res.ok) {
            const data = await res.json();
            if (data.approved) {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;
              setPaymentStatus("SUCCESS");
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 3000);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [paymentStatus, saleId]);

  const buildItemsPayload = () =>
    cartItems.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
      unitPrice: item.unit_price,
    }));

  const handleCashPayment = async () => {
    setPaymentStatus("PROCESSING");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount,
          paymentMethod: "CASH",
          items: buildItemsPayload(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMessage(data.error || "Erro ao processar venda.");
        setPaymentStatus("FAILED");
        return;
      }

      setPaymentStatus("SUCCESS");
    } catch {
      setErrorMessage("Erro de conexão ao processar venda.");
      setPaymentStatus("FAILED");
    }
  };

  const handleCardPayment = async () => {
    if (!DEVICE_ID) {
      alert("Mercado Pago Device ID not configured");
      return;
    }

    setPaymentStatus("PROCESSING");

    try {
      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalAmount,
          deviceId: DEVICE_ID,
          items: buildItemsPayload(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Error creating payment intent:", errorData);
        setPaymentStatus("FAILED");
        return;
      }

      const data = await res.json();
      setIntentId(data.intentId);
      setSaleId(data.saleId);
    } catch (error) {
      console.error("Network error or invalid response:", error);
      setPaymentStatus("FAILED");
    }
  };

  const handlePixPayment = () => {
    alert("Funcionalidade PIX ainda não implementada.");
  };

  const handleAmountReceivedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAmountReceived(value);
    const received = parseFloat(value);
    if (!isNaN(received)) {
      setChange(received - totalAmount);
    } else {
      setChange(0);
    }
  };

  if (!isOpen) return null;

  const renderContent = () => {
    switch (paymentStatus) {
      case "IDLE":
        return (
          <>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              Total: R$ {totalAmount.toFixed(2)}
            </h2>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <button
                onClick={() => setSelectedMethod("CASH")}
                className={`flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200
                  ${selectedMethod === "CASH" ? "bg-brand-green text-primary-dark shadow-lg" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
              >
                <Banknote size={36} />
                <span className="mt-2 text-sm font-medium">Dinheiro</span>
              </button>
              <button
                onClick={() => setSelectedMethod("CARD")}
                className={`flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200
                  ${selectedMethod === "CARD" ? "bg-brand-green text-primary-dark shadow-lg" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
              >
                <CreditCard size={36} />
                <span className="mt-2 text-sm font-medium">Cartão</span>
              </button>
              <button
                onClick={() => setSelectedMethod("PIX")}
                className={`flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200
                  ${selectedMethod === "PIX" ? "bg-brand-green text-primary-dark shadow-lg" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
              >
                <QrCode size={36} />
                <span className="mt-2 text-sm font-medium">PIX</span>
              </button>
            </div>

            {selectedMethod === "CASH" && (
              <div className="mb-6">
                <label
                  htmlFor="amountReceived"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Valor Recebido
                </label>
                <input
                  type="number"
                  id="amountReceived"
                  value={amountReceived}
                  onChange={handleAmountReceivedChange}
                  placeholder="R$ 0.00"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-lg focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
                />
                <p className="mt-3 text-lg font-bold text-gray-700 flex items-center gap-2">
                  <CircleDollarSign size={20} />
                  Troco:{" "}
                  <span className={change < 0 ? "text-red-500" : "text-brand-green"}>
                    R$ {change.toFixed(2)}
                  </span>
                </p>
              </div>
            )}

            <button
              onClick={() => {
                if (selectedMethod === "CASH") handleCashPayment();
                if (selectedMethod === "CARD") handleCardPayment();
                if (selectedMethod === "PIX") handlePixPayment();
              }}
              disabled={
                !selectedMethod ||
                (selectedMethod === "CASH" && (parseFloat(amountReceived) || 0) < totalAmount)
              }
              className="w-full bg-brand-green hover:bg-brand-green-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-primary-dark font-bold py-3 rounded-xl transition-colors duration-200 text-lg"
            >
              Pagar com{" "}
              {selectedMethod === "CASH"
                ? "Dinheiro"
                : selectedMethod === "CARD"
                  ? "Cartão"
                  : "PIX"}
            </button>
          </>
        );

      case "PROCESSING":
        return (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-[#303030] rounded-xl text-pure-white">
            <Loader2 size={64} className="animate-spin text-[#01f05a] mb-6" />
            <h2 className="text-3xl font-bold mb-3">Processando Pagamento</h2>
            <p className="text-lg text-gray-300">
              {selectedMethod === "CARD"
                ? "Aproxime, insira ou passe o cartão na maquininha Point."
                : "Registrando venda..."}
            </p>
            {intentId && (
              <p className="text-sm text-gray-500 mt-4">
                ID da Transação: {intentId}
              </p>
            )}
          </div>
        );

      case "SUCCESS":
        return (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-[#303030] rounded-xl text-pure-white">
            <CheckCircle size={64} className="text-[#01f05a] mb-6" />
            <h2 className="text-3xl font-bold mb-3">Pagamento Aprovado!</h2>
            <p className="text-lg text-gray-300">Obrigado pela preferência.</p>
            {selectedMethod === "CASH" && change > 0 && (
              <p className="text-xl font-bold text-[#01f05a] mt-4">
                Troco: R$ {change.toFixed(2)}
              </p>
            )}
            <button
              onClick={onPaymentSuccess}
              className="mt-8 bg-[#01f05a] text-[#303030] hover:bg-[#00d64f] font-bold py-3 px-8 rounded-2xl transition-colors duration-200 text-lg"
            >
              Nova Venda
            </button>
          </div>
        );

      case "FAILED":
        return (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-red-500 rounded-xl text-pure-white">
            <XCircle size={64} className="mb-6" />
            <h2 className="text-3xl font-bold mb-3">Pagamento Recusado</h2>
            <p className="text-lg">
              {errorMessage || "Por favor, tente novamente ou escolha outro método."}
            </p>
            <button
              onClick={() => {
                setPaymentStatus("IDLE");
                setErrorMessage(null);
              }}
              className="mt-8 bg-pure-white text-red-700 hover:bg-gray-100 font-bold py-3 px-8 rounded-xl transition-colors duration-200 text-lg"
            >
              Tentar Novamente
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-primary-dark/70 flex items-center justify-center z-50 p-4">
      <div className="bg-pure-white rounded-3xl shadow-2xl p-8 w-full max-w-lg">
        {renderContent()}
      </div>
    </div>
  );
}
