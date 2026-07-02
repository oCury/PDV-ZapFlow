"use client";

import { useState, useCallback, useRef, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  ScanBarcode,
  Loader2,
  KeyboardIcon,
  Wallet,
} from "lucide-react";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useProducts, type Product } from "@/hooks/useProducts";
import { MultiPaymentModal } from "@/components/pos/multi-payment-modal";
import { CustomerIdentificationModal } from "@/components/pos/customer-identification-modal";
import { PosProductGrid } from "@/components/pos/pos-product-grid";
import { CartSidebar } from "@/components/pos/cart-sidebar";
import { CartBottomSheet } from "@/components/pos/cart-bottom-sheet";
import { CashRegisterDrawer } from "@/components/pos/cash-register-drawer";
import { ProductModal } from "@/components/product-modal";
import type { CartItem } from "@/lib/validations/pos";
import type { ProductVariant } from "@/hooks/useProducts";

function PdvContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("tableId");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name?: string | null; loyalty_points?: number } | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);
  const [isCashRegisterOpen, setIsCashRegisterOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current); };
  }, []);
  const [tableOrder, setTableOrder] = useState<{
    tableId: string;
    tableNumber: number;
    phone: string;
    customerId: string | null;
  } | null>(null);
  const [isOpeningOrder, setIsOpeningOrder] = useState(false);

  useEffect(() => {
    if (tableId && typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("tableOrder");
        if (stored) {
          const data = JSON.parse(stored);
          if (data.tableId === tableId)
            setTableOrder({
              tableId: data.tableId,
              tableNumber: data.tableNumber ?? 0,
              phone: data.phone ?? "",
              customerId: data.customerId ?? null,
            });
        }
      } catch {
        // intentionally ignored
      }
    } else {
      setTableOrder(null);
    }
  }, [tableId]);

  const { products, loading, error, refetch } = useProducts();

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
    [cart]
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

  const addVariantToCart = useCallback(
    (product: Product, variant: ProductVariant) => {
      const cartId = `${product.id}::${variant.id}`;
      const variantPrice = variant.sell_price ?? product.sell_price;
      const label = [variant.size, variant.color].filter(Boolean).join(" / ");
      const displayName = label ? `${product.name} - ${label}` : product.name;

      setCart((prev) => {
        const existing = prev.find((item) => item.id === cartId);
        if (existing) {
          return prev.map((item) =>
            item.id === cartId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        return [
          ...prev,
          {
            id: cartId,
            name: displayName,
            quantity: 1,
            unit_price: variantPrice,
            productId: product.id,
            variantId: variant.id,
            size: variant.size,
            color: variant.color ?? undefined,
          },
        ];
      });

      setScanStatus(`✓ ${displayName} adicionado`);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      scanTimerRef.current = setTimeout(() => setScanStatus(null), 2000);
    },
    []
  );

  const handleProductClick = useCallback(
    (product: Product) => {
      // For variant products, stock is at variant level — PosProductGrid handles opening the selector
      if (product.has_variants) return;
      if (product.stock_quantity <= 0) return;
      addProductToCart(product);
      setScanStatus(`✓ ${product.name} adicionado`);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      scanTimerRef.current = setTimeout(() => setScanStatus(null), 2000);
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
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => setScanStatus(null), 3000);
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

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  }, []);

  const updatePrice = useCallback((id: string, unitPrice: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, unit_price: unitPrice } : item
      )
    );
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleFinishSale = () => {
    if (tableOrder && tableId) {
      handleOpenTableOrder();
    } else {
      setIsCustomerModalOpen(true);
      setIsCartSheetOpen(false);
    }
  };

  const handleCustomerConfirm = (customer: { id: string; name?: string | null; loyalty_points?: number } | null) => {
    setSelectedCustomer(customer);
    setIsCustomerModalOpen(false);
    setIsPaymentModalOpen(true);
  };

  const handleOpenTableOrder = useCallback(async () => {
    if (!tableOrder || !tableId || cart.length === 0) return;
    setIsOpeningOrder(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: tableOrder.tableId,
          customerPhone: tableOrder.phone,
          customerId: tableOrder.customerId ?? undefined,
          items: cart.map((item) => ({
            productId: item.productId ?? item.id,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            size: item.size,
            color: item.color,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Erro ao abrir comanda.");
        return;
      }
      sessionStorage.removeItem("tableOrder");
      setCart([]);
      setIsCartSheetOpen(false);
      window.location.href = "/tables";
    } catch {
      alert("Erro de conexão ao abrir comanda.");
    } finally {
      setIsOpeningOrder(false);
    }
  }, [tableOrder, tableId, cart]);

  const handleAddNewProduct = useCallback(() => setIsProductModalOpen(true), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 → focus search/barcode input
      if (e.key === "F2") {
        e.preventDefault();
        manualInputRef.current?.focus();
        return;
      }

      // F4 → open cart sheet (mobile) or trigger checkout (desktop, if cart has items)
      if (e.key === "F4") {
        e.preventDefault();
        if (cart.length > 0) {
          // On mobile show cart sheet; on desktop trigger finish sale directly
          const isDesktop = window.innerWidth >= 1024;
          if (isDesktop) {
            handleFinishSale();
          } else {
            setIsCartSheetOpen(true);
          }
        }
        return;
      }

      // Escape → close any open modal (in priority order)
      if (e.key === "Escape") {
        if (isPaymentModalOpen) { setIsPaymentModalOpen(false); return; }
        if (isCustomerModalOpen) { setIsCustomerModalOpen(false); return; }
        if (isProductModalOpen) { setIsProductModalOpen(false); return; }
        if (isCashRegisterOpen) { setIsCashRegisterOpen(false); return; }
        if (isCartSheetOpen) { setIsCartSheetOpen(false); return; }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cart.length,
    handleFinishSale,
    isPaymentModalOpen,
    isCustomerModalOpen,
    isProductModalOpen,
    isCashRegisterOpen,
    isCartSheetOpen,
  ]);

  const handlePaymentSuccess = useCallback(() => {
    setCart([]);
    setIsPaymentModalOpen(false);
    setSelectedCustomer(null);
    refetch();
  }, [refetch]);

  return (
    /*
     * Mobile  → fixed inset-0: full-screen overlay covering the bottom nav.
     * Desktop → static h-full, AppShell gives the main no padding on PDV
     *            so this div fills 100% of the flex-1 main with no gaps.
     */
    <div className={[
      "pdv-theme overflow-hidden flex flex-col",
      "fixed inset-0 z-10",
      "lg:static lg:inset-auto lg:h-full",
    ].join(" ")}>
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4 lg:gap-0 overflow-hidden">

      {/* Left: Product Grid */}
      <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-white">PDV</h1>
            <p className="text-slate-400 text-sm mt-0.5">Ponto de Venda</p>
          </div>
          <button
            type="button"
            onClick={() => setIsCashRegisterOpen(true)}
            className="touch-target min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300"
            title="Caixa"
          >
            <Wallet size={22} />
          </button>
        </div>

        {/* Manual Barcode Entry */}
        <div className="shrink-0 mt-3 sm:mt-4 p-3 sm:p-4 rounded-2xl bg-slate-700/50 border border-slate-600/50">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <KeyboardIcon size={16} className="text-brand-green shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate">
              Entrada Manual de Código
            </span>
            <span className="ml-auto shrink-0 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-600 text-slate-400 border border-slate-500">
              F2
            </span>
          </div>
          <div className="flex gap-2 min-w-0">
            <input
              ref={manualInputRef}
              type="text"
              inputMode="numeric"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleManualSubmit();
                }
              }}
              placeholder="Código de barras..."
              className="min-w-0 flex-1 min-h-[48px] px-3 sm:px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green/50 font-mono text-base sm:text-lg"
              autoFocus
            />
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={!manualBarcode.trim() || isSearching}
              className="touch-target shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:cursor-not-allowed text-primary-dark font-semibold rounded-xl transition-colors"
            >
              <ScanBarcode size={20} />
            </button>
          </div>
        </div>

        {/* Scan Status */}
        {(scanStatus || isSearching) && (
          <div
            className={`shrink-0 mt-3 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium min-h-[44px] ${
              isSearching
                ? "bg-blue-500/20 text-blue-300"
                : scanStatus?.startsWith("✓")
                  ? "bg-brand-green/20 text-brand-green"
                  : "bg-red-500/20 text-red-300"
            }`}
          >
            {isSearching ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ScanBarcode size={18} />
            )}
            {isSearching ? "Buscando produto..." : scanStatus}
          </div>
        )}

        {/* Product Grid — pb clears the FAB+bottom-nav on mobile; removed on desktop */}
        <div className="flex-1 mt-3 sm:mt-4 overflow-y-auto min-h-0 pb-24 lg:pb-2">
          <PosProductGrid
            products={products}
            loading={loading}
            error={error}
            onProductClick={handleProductClick}
            onVariantClick={addVariantToCart}
            onAddNewProduct={handleAddNewProduct}
          />
        </div>
      </div>

      {/* Right: Cart Sidebar (Desktop) */}
      <div className="hidden lg:flex lg:w-[380px] xl:w-[420px] shrink-0 p-4 sm:p-6 pl-0">
        <CartSidebar
          cart={cart}
          total={total}
          onQuantityChange={updateQuantity}
          onPriceOverride={updatePrice}
          onRemove={removeFromCart}
          onFinishSale={handleFinishSale}
          allowPriceOverride
          tableMode={tableOrder ? { tableNumber: tableOrder.tableNumber, phone: tableOrder.phone } : undefined}
          requiresTablePhone={Boolean(tableId && !tableOrder)}
          onBackToTables={() => (window.location.href = "/tables")}
          isOpeningOrder={isOpeningOrder}
        />
      </div>

      {/* Mobile: Floating Cart Button — positioned above the bottom nav */}
      <button
        type="button"
        onClick={() => setIsCartSheetOpen(true)}
        className="lg:hidden fixed bottom-[76px] right-5 z-40 touch-target min-h-[56px] min-w-[56px] flex items-center justify-center rounded-full bg-brand-green hover:bg-brand-green-hover text-primary-dark shadow-xl shadow-brand-green/25"
        title="Abrir carrinho (F4)"
      >
        <ShoppingCart size={28} />
        {cart.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-primary-dark text-brand-green text-xs font-bold">
            {cart.length}
          </span>
        )}
        <span className="absolute -bottom-1 -left-1 hidden sm:flex items-center px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-primary-dark text-slate-400 border border-slate-600">
          F4
        </span>
      </button>

      {/* Mobile: Cart Bottom Sheet */}
      <CartBottomSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        cart={cart}
        total={total}
        onQuantityChange={updateQuantity}
        onPriceOverride={updatePrice}
        onRemove={removeFromCart}
        onFinishSale={handleFinishSale}
        allowPriceOverride
        tableMode={tableOrder ? { tableNumber: tableOrder.tableNumber, phone: tableOrder.phone } : undefined}
        requiresTablePhone={Boolean(tableId && !tableOrder)}
        onBackToTables={() => (window.location.href = "/tables")}
        isOpeningOrder={isOpeningOrder}
      />

      <CustomerIdentificationModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onConfirm={handleCustomerConfirm}
      />

      <MultiPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        totalAmount={total}
        cartItems={cart}
        onPaymentSuccess={handlePaymentSuccess}
        selectedCustomer={selectedCustomer}
      />

      <CashRegisterDrawer
        isOpen={isCashRegisterOpen}
        onClose={() => setIsCashRegisterOpen(false)}
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
    </div>
  );
}

export default function PdvPage() {
  return (
    <Suspense fallback={
      <div className="pdv-theme flex h-screen items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-green" />
      </div>
    }>
      <PdvContent />
    </Suspense>
  );
}
