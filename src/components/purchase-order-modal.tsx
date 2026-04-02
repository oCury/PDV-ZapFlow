"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Printer,
  ShoppingCart,
  Package,
  AlertTriangle,
  Check,
  Minus,
  Plus,
} from "lucide-react";

interface LowStockProduct {
  id: string;
  name: string;
  stock_quantity: number;
  category: string;
  barcode?: string;
}

interface OrderItem extends LowStockProduct {
  orderQuantity: number;
  selected: boolean;
}

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: LowStockProduct[];
}

export function PurchaseOrderModal({ isOpen, onClose, products }: PurchaseOrderModalProps) {
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (products.length > 0) {
      setOrderItems(
        products.map((p) => ({
          ...p,
          orderQuantity: Math.max(10 - p.stock_quantity, 5),
          selected: true,
        }))
      );
    }
  }, [products]);

  const toggleItem = (id: string) => {
    setOrderItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const updateQuantity = (id: string, delta: number) => {
    setOrderItems((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, orderQuantity: Math.max(1, item.orderQuantity + delta) }
          : item
      )
    );
  };

  const setQuantity = (id: string, qty: number) => {
    setOrderItems((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, orderQuantity: Math.max(1, qty) }
          : item
      )
    );
  };

  const selectedItems = orderItems.filter((item) => item.selected);
  const totalItems = selectedItems.reduce((sum, item) => sum + item.orderQuantity, 0);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR");
    const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pedido de Compra - ${dateStr}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header { 
            text-align: center; 
            border-bottom: 2px solid #000; 
            padding-bottom: 15px; 
            margin-bottom: 20px; 
          }
          .header h1 { font-size: 24px; margin-bottom: 5px; }
          .header p { font-size: 12px; color: #666; }
          .urgent { 
            background: #fee2e2; 
            border: 1px solid #ef4444; 
            padding: 10px; 
            margin-bottom: 15px; 
            border-radius: 4px;
            text-align: center;
            font-weight: bold;
            color: #dc2626;
          }
          .info { margin-bottom: 20px; }
          .info p { margin: 5px 0; font-size: 14px; }
          .info strong { display: inline-block; width: 100px; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 20px; 
          }
          th, td { 
            border: 1px solid #333; 
            padding: 10px 8px; 
            text-align: left; 
          }
          th { 
            background: #f3f4f6; 
            font-weight: bold;
            font-size: 12px;
          }
          td { font-size: 13px; }
          .qty { text-align: center; font-weight: bold; }
          .stock { text-align: center; color: #dc2626; }
          .category { font-size: 11px; color: #666; }
          .total-row { 
            background: #f3f4f6; 
            font-weight: bold; 
          }
          .notes { 
            border: 1px solid #ccc; 
            padding: 10px; 
            margin-bottom: 20px;
            min-height: 60px;
          }
          .notes-label { font-weight: bold; margin-bottom: 5px; font-size: 12px; }
          .signature { 
            margin-top: 40px; 
            display: flex; 
            justify-content: space-between; 
          }
          .signature-line { 
            width: 45%; 
            text-align: center; 
          }
          .signature-line hr { 
            border: none; 
            border-top: 1px solid #000; 
            margin-bottom: 5px; 
          }
          .signature-line span { font-size: 12px; }
          .footer { 
            margin-top: 30px; 
            text-align: center; 
            font-size: 10px; 
            color: #666; 
          }
          .checkbox { 
            display: inline-block; 
            width: 16px; 
            height: 16px; 
            border: 2px solid #333; 
            margin-right: 8px; 
            vertical-align: middle;
          }
          @media print {
            body { padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📋 PEDIDO DE COMPRA</h1>
          <p>Data: ${dateStr} às ${timeStr}</p>
        </div>

        <div class="urgent">
          ⚠️ URGENTE - ESTOQUE BAIXO - COMPRAR O MAIS RÁPIDO POSSÍVEL
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">✓</th>
              <th>Produto</th>
              <th style="width: 80px;">Categoria</th>
              <th style="width: 70px;">Estoque</th>
              <th style="width: 80px;">Pedir</th>
            </tr>
          </thead>
          <tbody>
            ${selectedItems.map((item) => `
              <tr>
                <td><span class="checkbox"></span></td>
                <td>
                  <strong>${item.name}</strong>
                  ${item.barcode ? `<br><span style="font-size:10px;color:#666;">Cód: ${item.barcode}</span>` : ""}
                </td>
                <td class="category">${item.category || "-"}</td>
                <td class="stock">${item.stock_quantity} un.</td>
                <td class="qty">${item.orderQuantity} un.</td>
              </tr>
            `).join("")}
            <tr class="total-row">
              <td colspan="4" style="text-align: right;">TOTAL DE ITENS:</td>
              <td class="qty">${totalItems} un.</td>
            </tr>
          </tbody>
        </table>

        ${notes ? `
        <div>
          <p class="notes-label">Observações:</p>
          <div class="notes">${notes.replace(/\n/g, "<br>")}</div>
        </div>
        ` : `
        <div>
          <p class="notes-label">Observações:</p>
          <div class="notes"></div>
        </div>
        `}

        <div class="signature">
          <div class="signature-line">
            <hr />
            <span>Solicitante</span>
          </div>
          <div class="signature-line">
            <hr />
            <span>Aprovação</span>
          </div>
        </div>

        <div class="footer">
          <p>Documento gerado pelo PDV ZapFlow em ${dateStr} às ${timeStr}</p>
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-xl">
              <ShoppingCart size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-slate-100 text-lg">Pedido de Compra</h2>
              <p className="text-xs text-slate-400">
                {selectedItems.length} produto{selectedItems.length !== 1 ? "s" : ""} selecionado{selectedItems.length !== 1 ? "s" : ""} · {totalItems} unidades
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Alert */}
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-400 font-medium">
            URGENTE - Comprar o mais rápido possível!
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Product List */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Produtos para comprar
            </label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {orderItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    item.selected
                      ? "bg-slate-700/50 border-amber-500/30"
                      : "bg-slate-800/50 border-slate-700 opacity-50"
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleItem(item.id)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      item.selected
                        ? "bg-amber-500 border-amber-500 text-slate-900"
                        : "border-slate-500"
                    }`}
                  >
                    {item.selected && <Check size={12} strokeWidth={3} />}
                  </button>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">{item.category}</span>
                      <span className="text-xs text-red-400 font-medium">
                        Estoque: {item.stock_quantity} un.
                      </span>
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  {item.selected && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-300 transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        value={item.orderQuantity}
                        onChange={(e) => setQuantity(item.id, parseInt(e.target.value) || 1)}
                        className="w-14 text-center px-2 py-1 rounded-lg bg-slate-600 border border-slate-500 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
                        min="1"
                      />
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-300 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações adicionais..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 resize-none"
            />
          </div>
        </div>

        {/* Hidden Print Content */}
        <div ref={printRef} className="hidden" />

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handlePrint}
            disabled={selectedItems.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-600 disabled:text-slate-400 text-slate-900 font-bold rounded-2xl transition-colors"
          >
            <Printer size={18} />
            Imprimir Pedido
          </button>
        </div>
      </div>
    </div>
  );
}
