"use client";

import { useState, useCallback, useRef } from "react";
import {
  ShoppingCart,
  Trash2,
  CreditCard,
  Banknote,
  QrCode,
  ScanBarcode,
  Loader2,
  KeyboardIcon,
} from "lucide-react";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useProducts, type Product } from "@/hooks/useProducts";
import { PaymentModal } from "@/components/payment-modal";
import { PosProductGrid } from "@/components/pos-product-grid";
import { ProductModal } from "@/components/product-modal";

export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export default function PdvPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  const { products, loading, error, refetch } = useProducts();

  const total = cart.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  const addProductToCart = useCallback(
    (product: { id: string; name: string; sell_price: number }) => {
      setCart((prev) => {
        const existing = prev.find((item) => item.id === product.id);
        if (existing) {
          return prev.map((item) =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        return [
          ...prev,
          {
            id: product.id,
            name: product.name,
            quantity: 1,
            unit_price: product.sell_price,
          },
        ];
      });
    },
    []
  );

  const handleProductClick = useCallback(
    (product: Product) => {
      if (product.stock_quantity <= 0) return;
      addProductToCart(product);
      setScanStatus(`✓ ${product.name} adicionado`);
      setTimeout(() => setScanStatus(null), 2000);
    },
    [addProductToCart]
  );

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      setScanStatus(null);
      setIsSearching(true);

      try {
        const res = await fetch(
          `/api/products/barcode/${encodeURIComponent(barcode)}`
        );

        if (!res.ok) {
          setScanStatus(
            res.status === 404
              ? `Produto não encontrado: ${barcode}`
              : "Erro ao buscar produto"
          );
          return;
        }

        const product = await res.json();
        if (product.stock_quantity <= 0) {
          setScanStatus(`Produto sem estoque: ${product.name}`);
          return;
        }

        addProductToCart(product);
        setScanStatus(`✓ ${product.name} adicionado`);
      } catch {
        setScanStatus("Erro de conexão ao buscar produto");
      } finally {
        setIsSearching(false);
        setTimeout(() => setScanStatus(null), 3000);
      }
    },
    [addProductToCart]
  );

  useBarcodeScanner({ onScan: handleBarcodeScan });

  const handleManualSubmit = () => {
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    handleBarcodeScan(trimmed);
    setManualBarcode("");
    manualInputRef.current?.focus();
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const handlePaymentSuccess = useCallback(() => {
    setCart([]);
    setPaymentMethod(null);
    setIsPaymentModalOpen(false);
    refetch();
  }, [refetch]);

  return (
    <div className="flex gap-6 h-[calc(100vh-3rem)]">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold text-primary-dark">PDV</h1>
          <p className="text-gray-500 text-sm mt-1">Ponto de Venda</p>
        </div>

        {/* Manual Barcode Entry */}
        <div className="shrink-0 mt-4 bg-pure-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <KeyboardIcon size={18} className="text-brand-green" />
            <span className="text-sm font-semibold text-primary-dark">
              Entrada Manual de Código
            </span>
          </div>
          <div className="flex gap-2">
            <input
              ref={manualInputRef}
              type="text"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleManualSubmit();
                }
              }}
              placeholder="Digite o código de barras e pressione Enter..."
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              autoFocus
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualBarcode.trim() || isSearching}
              className="bg-brand-green hover:bg-brand-green-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-primary-dark font-semibold px-6 py-3 rounded-xl transition-colors duration-200 flex items-center gap-2"
            >
              <ScanBarcode size={18} />
              Buscar
            </button>
          </div>
        </div>

        {/* Scan Status */}
        {(scanStatus || isSearching) && (
          <div
            className={`shrink-0 mt-3 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
              isSearching
                ? "bg-blue-50 text-blue-700"
                : scanStatus?.startsWith("✓")
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
            }`}
          >
            {isSearching ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ScanBarcode size={16} />
            )}
            {isSearching ? "Buscando produto..." : scanStatus}
          </div>
        )}

        {/* Product Grid */}
        <div className="flex-1 mt-4 overflow-y-auto">
          <PosProductGrid
            products={products}
            loading={loading}
            error={error}
            onProductClick={handleProductClick}
            onAddNewProduct={() => setIsProductModalOpen(true)}
          />
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-96 shrink-0 bg-pure-white rounded-2xl shadow-sm border border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} className="text-brand-green" />
            <h2 className="font-semibold text-primary-dark">Carrinho</h2>
            <span className="ml-auto bg-brand-green/10 text-brand-green text-xs font-bold px-2 py-0.5 rounded-full">
              {cart.length} itens
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart size={40} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Carrinho vazio</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary-dark">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {item.quantity}x R$ {item.unit_price.toFixed(2)}
                  </p>
                </div>
                <p className="text-sm font-bold text-brand-green">
                  R$ {(item.quantity * item.unit_price).toFixed(2)}
                </p>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-100 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 font-medium">Total</span>
            <span className="text-2xl font-bold text-primary-dark">
              R$ {total.toFixed(2)}
            </span>
          </div>

          <div className="flex gap-2">
            {[
              { key: "CASH", icon: Banknote, label: "Dinheiro" },
              { key: "CARD", icon: CreditCard, label: "Cartão" },
              { key: "PIX", icon: QrCode, label: "PIX" },
            ].map((method) => (
              <button
                key={method.key}
                onClick={() => setPaymentMethod(method.key)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  paymentMethod === method.key
                    ? "bg-brand-green text-primary-dark"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <method.icon size={18} />
                {method.label}
              </button>
            ))}
          </div>

          <button
            disabled={cart.length === 0 || !paymentMethod}
            onClick={() => setIsPaymentModalOpen(true)}
            className="w-full bg-brand-green hover:bg-brand-green-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-primary-dark font-bold py-3 rounded-xl transition-colors duration-200 text-sm"
          >
            Finalizar Venda
          </button>
        </div>
      </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        totalAmount={total}
        cartItems={cart}
        onPaymentSuccess={handlePaymentSuccess}
      />

      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSaved={() => {
          refetch();
          setIsProductModalOpen(false);
        }}
      />
    </div>
  );
}
