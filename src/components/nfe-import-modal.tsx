"use client";

import { useState, useRef } from "react";
import { X, Upload, FileText, Check, AlertTriangle, Loader2, Package, Trash2 } from "lucide-react";

interface NfeProduct {
  name: string;
  barcode: string;
  cost_price: number;
  sell_price: number;
  stock_quantity: number;
  category: string;
  selected: boolean;
}

interface NfeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

function parseNfeXml(xmlText: string): NfeProduct[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Arquivo XML inválido.");
  }

  // Handle namespace - try with and without
  const ns = "http://www.portalfiscal.inf.br/nfe";
  let detElements = doc.getElementsByTagNameNS(ns, "det");

  // Fallback: try without namespace
  if (detElements.length === 0) {
    detElements = doc.getElementsByTagName("det");
  }

  if (detElements.length === 0) {
    throw new Error("Nenhum produto encontrado no XML. Verifique se é um arquivo NF-e válido.");
  }

  const products: NfeProduct[] = [];

  for (let i = 0; i < detElements.length; i++) {
    const det = detElements[i];

    const getText = (tagName: string): string => {
      const el = det.getElementsByTagNameNS(ns, tagName)[0]
        || det.getElementsByTagName(tagName)[0];
      return el?.textContent?.trim() || "";
    };

    const name = getText("xProd");
    const barcode = getText("cEAN");
    const quantity = parseFloat(getText("qCom")) || 0;
    const unitPrice = parseFloat(getText("vUnCom")) || 0;

    // Skip products without barcode (SEM GTIN)
    const validBarcode = barcode && barcode !== "SEM GTIN" && barcode.length >= 8;

    products.push({
      name,
      barcode: validBarcode ? barcode : `NFE-${getText("cProd") || Date.now()}-${i}`,
      cost_price: unitPrice,
      sell_price: Math.ceil(unitPrice * 1.3 * 100) / 100, // 30% markup suggestion
      stock_quantity: Math.round(quantity),
      category: "Importado NF-e",
      selected: true,
    });
  }

  return products;
}

export function NfeImportModal({ isOpen, onClose, onImported }: NfeImportModalProps) {
  const [products, setProducts] = useState<NfeProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; success: boolean } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [markup, setMarkup] = useState(30);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const xmlText = ev.target?.result as string;
        const parsed = parseNfeXml(xmlText);
        setProducts(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao ler XML.");
        setProducts([]);
      }
    };
    reader.onerror = () => {
      setError("Erro ao ler o arquivo.");
    };
    reader.readAsText(file);
  };

  const applyMarkup = () => {
    setProducts((prev) =>
      prev.map((p) => ({
        ...p,
        sell_price: Math.ceil(p.cost_price * (1 + markup / 100) * 100) / 100,
      }))
    );
  };

  const toggleProduct = (index: number) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, selected: !p.selected } : p))
    );
  };

  const updateProduct = (index: number, field: keyof NfeProduct, value: string | number) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const handleImport = async () => {
    const selected = products.filter((p) => p.selected);
    if (selected.length === 0) {
      setError("Selecione pelo menos um produto.");
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: selected.map(({ selected: _, ...p }) => p),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao importar.");
        return;
      }

      setResult({ message: data.message, success: true });
      onImported();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setProducts([]);
    setError(null);
    setResult(null);
    setFileName(null);
    onClose();
  };

  const selectedCount = products.filter((p) => p.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-brand-green/20 p-2.5 rounded-xl">
              <FileText size={22} className="text-brand-green" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Importar NF-e</h2>
              <p className="text-xs text-slate-400">
                Carregue um XML de Nota Fiscal Eletrônica para cadastrar produtos
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Upload Area */}
          {products.length === 0 && !result && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-600 hover:border-brand-green/50 rounded-2xl p-8 text-center cursor-pointer transition-colors group"
            >
              <Upload size={40} className="mx-auto text-slate-500 group-hover:text-brand-green transition-colors mb-3" />
              <p className="text-slate-300 font-medium">
                Clique para selecionar o arquivo XML
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Aceita arquivos .xml de NF-e (Nota Fiscal Eletrônica)
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xml"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
              <AlertTriangle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Success Result */}
          {result?.success && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-xl">
              <Check size={16} className="shrink-0" />
              {result.message}
            </div>
          )}

          {/* Products Preview */}
          {products.length > 0 && !result && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-slate-400" />
                  <span className="text-sm text-slate-300">
                    {fileName} — <strong>{products.length}</strong> produto(s) encontrado(s)
                  </span>
                </div>
                <button
                  onClick={() => {
                    setProducts([]);
                    setFileName(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={12} />
                  Limpar
                </button>
              </div>

              {/* Markup Control */}
              <div className="flex items-center gap-3 bg-slate-700/50 rounded-xl px-4 py-3">
                <span className="text-sm text-slate-300">Margem de lucro:</span>
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={markup}
                  onChange={(e) => setMarkup(parseInt(e.target.value) || 0)}
                  className="w-20 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 text-center focus:outline-none focus:border-brand-green"
                />
                <span className="text-sm text-slate-400">%</span>
                <button
                  onClick={applyMarkup}
                  className="px-3 py-1.5 bg-brand-green/20 text-brand-green text-xs font-semibold rounded-lg hover:bg-brand-green/30 transition-colors"
                >
                  Aplicar
                </button>
                <span className="text-xs text-slate-500 ml-auto">
                  Custo da NF-e + margem = Preço de venda
                </span>
              </div>

              {/* Products Table */}
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/50 text-slate-400 text-xs">
                      <th className="py-2 px-3 text-left w-8">
                        <input
                          type="checkbox"
                          checked={selectedCount === products.length}
                          onChange={() => {
                            const allSelected = selectedCount === products.length;
                            setProducts((prev) => prev.map((p) => ({ ...p, selected: !allSelected })));
                          }}
                          className="accent-brand-green"
                        />
                      </th>
                      <th className="py-2 px-3 text-left">Produto</th>
                      <th className="py-2 px-3 text-left">Código</th>
                      <th className="py-2 px-3 text-right">Custo</th>
                      <th className="py-2 px-3 text-right">Venda</th>
                      <th className="py-2 px-3 text-center">Qtd</th>
                      <th className="py-2 px-3 text-left">Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product, i) => (
                      <tr
                        key={i}
                        className={`border-t border-slate-700/50 transition-colors ${
                          product.selected ? "bg-slate-800" : "bg-slate-800/30 opacity-50"
                        }`}
                      >
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={product.selected}
                            onChange={() => toggleProduct(i)}
                            className="accent-brand-green"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            value={product.name}
                            onChange={(e) => updateProduct(i, "name", e.target.value)}
                            className="w-full bg-transparent text-slate-200 text-sm focus:outline-none focus:bg-slate-700/50 rounded px-1 -mx-1"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-slate-400">
                          {product.barcode.length > 15 ? product.barcode.slice(0, 15) + "…" : product.barcode}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400">
                          R$ {product.cost_price.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={product.sell_price}
                            onChange={(e) => updateProduct(i, "sell_price", parseFloat(e.target.value) || 0)}
                            className="w-20 text-right bg-transparent text-brand-green font-semibold text-sm focus:outline-none focus:bg-slate-700/50 rounded px-1"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            value={product.stock_quantity}
                            onChange={(e) => updateProduct(i, "stock_quantity", parseInt(e.target.value) || 0)}
                            className="w-14 text-center bg-transparent text-slate-200 text-sm focus:outline-none focus:bg-slate-700/50 rounded"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            value={product.category}
                            onChange={(e) => updateProduct(i, "category", e.target.value)}
                            className="w-full bg-transparent text-slate-400 text-xs focus:outline-none focus:bg-slate-700/50 rounded px-1 -mx-1"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 shrink-0">
          {products.length > 0 && !result ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">
                {selectedCount} de {products.length} selecionado(s)
              </span>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || selectedCount === 0}
                  className="px-5 py-2.5 rounded-xl bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:cursor-not-allowed text-primary-dark font-bold text-sm transition-colors flex items-center gap-2"
                >
                  {importing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  Importar {selectedCount} Produto(s)
                </button>
              </div>
            </div>
          ) : result ? (
            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark font-bold text-sm transition-colors"
              >
                Fechar
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center">
              O XML da NF-e é o arquivo digital que acompanha toda nota fiscal eletrônica.
              Você pode obtê-lo no e-mail do fornecedor ou no portal da SEFAZ.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
