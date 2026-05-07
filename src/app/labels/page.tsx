"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Tag,
  Download,
  Search,
  Printer,
  Settings2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Minus,
  Plus,
} from "lucide-react";
import { useProducts, type Product, type ProductVariant } from "@/hooks/useProducts";
import type { LabelTemplate, LabelItemData } from "@/lib/validations/labels";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SelectedItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

type TemplateId = "40x25" | "50x30" | "custom";

interface TemplateOption {
  id: TemplateId;
  label: string;
}

const TEMPLATE_OPTIONS: readonly TemplateOption[] = [
  { id: "40x25", label: "40x25mm (3x10)" },
  { id: "50x30", label: "50x30mm (2x8)" },
  { id: "custom", label: "Personalizado" },
] as const;

const DEFAULT_CUSTOM_TEMPLATE: LabelTemplate = {
  widthMm: 40,
  heightMm: 25,
  columns: 3,
  rows: 10,
  fontSize: 8,
  showPrice: true,
  showBarcode: true,
  showSize: true,
  showColor: true,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function itemKey(productId: string, variantId?: string): string {
  return variantId ? `${productId}::${variantId}` : productId;
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function LabelsPage() {
  const { products, loading, error } = useProducts();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const [templateId, setTemplateId] = useState<TemplateId>("40x25");
  const [customTemplate, setCustomTemplate] = useState<LabelTemplate>(DEFAULT_CUSTOM_TEMPLATE);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showSize, setShowSize] = useState(true);
  const [showColor, setShowColor] = useState(true);

  const [generating, setGenerating] = useState(false);

  // Load saved custom template
  useEffect(() => {
    fetch("/api/labels/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.templates?.custom) {
          setCustomTemplate(data.templates.custom as LabelTemplate);
        }
      })
      .catch(() => {});
  }, []);

  // ─── Filtered Products ─────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.variants?.some(
          (v) =>
            v.sku?.toLowerCase().includes(q) ||
            v.barcode?.toLowerCase().includes(q),
        ),
    );
  }, [products, searchQuery]);

  // ─── Selection Handlers ───────────────────────────────────────────────

  const totalLabels = useMemo(() => {
    let total = 0;
    selectedItems.forEach((item) => {
      total += item.quantity;
    });
    return total;
  }, [selectedItems]);

  const toggleProductExpanded = useCallback((productId: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  const toggleItem = useCallback(
    (productId: string, variantId?: string) => {
      const key = itemKey(productId, variantId);
      setSelectedItems((prev) => {
        const next = new Map(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.set(key, { productId, variantId, quantity: 1 });
        }
        return next;
      });
    },
    [],
  );

  const updateQuantity = useCallback(
    (productId: string, variantId: string | undefined, quantity: number) => {
      const key = itemKey(productId, variantId);
      if (quantity <= 0) {
        setSelectedItems((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        return;
      }
      setSelectedItems((prev) => {
        const next = new Map(prev);
        const existing = next.get(key);
        if (existing) {
          next.set(key, { ...existing, quantity: Math.min(quantity, 100) });
        }
        return next;
      });
    },
    [],
  );

  const selectAllVariants = useCallback(
    (product: Product) => {
      if (!product.variants?.length) return;
      setSelectedItems((prev) => {
        const next = new Map(prev);
        const allSelected = product.variants!.every((v) =>
          next.has(itemKey(product.id, v.id)),
        );

        if (allSelected) {
          for (const v of product.variants!) {
            next.delete(itemKey(product.id, v.id));
          }
        } else {
          for (const v of product.variants!) {
            const key = itemKey(product.id, v.id);
            if (!next.has(key)) {
              next.set(key, {
                productId: product.id,
                variantId: v.id,
                quantity: 1,
              });
            }
          }
        }
        return next;
      });
    },
    [],
  );

  // ─── PDF Generation ───────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (selectedItems.size === 0) return;
    setGenerating(true);

    try {
      const items = Array.from(selectedItems.values());

      const res = await fetch("/api/labels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, templateId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao buscar dados dos produtos");
      }

      const data = await res.json() as { items: LabelItemData[] };

      // Dynamic import to keep bundle small
      const { generateLabelsPDF, getTemplate } = await import(
        "@/lib/labels/generator"
      );

      const template: LabelTemplate =
        templateId === "custom"
          ? { ...customTemplate, showPrice, showBarcode, showSize, showColor }
          : {
              ...getTemplate(templateId),
              showPrice,
              showBarcode,
              showSize,
              showColor,
            };

      const doc = generateLabelsPDF(data.items, template);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");

      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar etiquetas";
      alert(message);
    } finally {
      setGenerating(false);
    }
  }, [selectedItems, templateId, customTemplate, showPrice, showBarcode, showSize, showColor]);

  // ─── Custom Template Change ───────────────────────────────────────────

  const updateCustomField = useCallback(
    (field: keyof LabelTemplate, value: number) => {
      setCustomTemplate((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Tag size={24} className="text-brand-green" />
            Etiquetas
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Selecione produtos e gere etiquetas com código de barras
          </p>
        </div>
        {totalLabels > 0 && (
          <span className="text-sm font-semibold text-brand-green bg-brand-green/10 px-4 py-2 rounded-full">
            {totalLabels} {totalLabels === 1 ? "etiqueta" : "etiquetas"} selecionada{totalLabels === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left: Product Selector ────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Buscar por nome, código de barras ou SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-pure-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green/50 focus:border-brand-green/50 transition-colors"
            />
          </div>

          {/* Product List */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {loading && (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 size={24} className="animate-spin mr-2" />
                Carregando produtos...
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center py-16 text-red-400">
                {error}
              </div>
            )}

            {!loading && !error && filteredProducts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Package size={32} className="mb-2 opacity-50" />
                {searchQuery
                  ? "Nenhum produto encontrado"
                  : "Nenhum produto cadastrado"}
              </div>
            )}

            {!loading && !error && filteredProducts.length > 0 && (
              <div className="divide-y divide-white/5">
                {filteredProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    selectedItems={selectedItems}
                    expanded={expandedProducts.has(product.id)}
                    onToggleExpand={toggleProductExpanded}
                    onToggleItem={toggleItem}
                    onUpdateQuantity={updateQuantity}
                    onSelectAllVariants={selectAllVariants}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Right: Config + Actions ───────────────────────────────── */}
        <div className="space-y-4">
          {/* Template Config */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Settings2 size={16} className="text-brand-green" />
              Configuração
            </h2>

            {/* Template Select */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Modelo de etiqueta
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value as TemplateId)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/50"
              >
                {TEMPLATE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-slate-800">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Template Fields */}
            {templateId === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Largura (mm)"
                  value={customTemplate.widthMm}
                  onChange={(v) => updateCustomField("widthMm", v)}
                  min={10}
                  max={100}
                />
                <NumberInput
                  label="Altura (mm)"
                  value={customTemplate.heightMm}
                  onChange={(v) => updateCustomField("heightMm", v)}
                  min={10}
                  max={100}
                />
                <NumberInput
                  label="Colunas"
                  value={customTemplate.columns}
                  onChange={(v) => updateCustomField("columns", v)}
                  min={1}
                  max={5}
                  step={1}
                />
                <NumberInput
                  label="Linhas"
                  value={customTemplate.rows}
                  onChange={(v) => updateCustomField("rows", v)}
                  min={1}
                  max={15}
                  step={1}
                />
                <NumberInput
                  label="Fonte (pt)"
                  value={customTemplate.fontSize}
                  onChange={(v) => updateCustomField("fontSize", v)}
                  min={5}
                  max={16}
                  step={0.5}
                />
              </div>
            )}

            {/* Toggles */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <ToggleRow
                label="Mostrar preço"
                checked={showPrice}
                onChange={setShowPrice}
              />
              <ToggleRow
                label="Mostrar código de barras"
                checked={showBarcode}
                onChange={setShowBarcode}
              />
              <ToggleRow
                label="Mostrar tamanho"
                checked={showSize}
                onChange={setShowSize}
              />
              <ToggleRow
                label="Mostrar cor"
                checked={showColor}
                onChange={setShowColor}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Printer size={16} className="text-brand-green" />
              Gerar Etiquetas
            </h2>

            <p className="text-xs text-slate-400">
              {totalLabels === 0
                ? "Selecione ao menos um produto para gerar as etiquetas."
                : `${totalLabels} etiqueta${totalLabels !== 1 ? "s" : ""} de ${selectedItems.size} item${selectedItems.size !== 1 ? "ns" : ""} será${totalLabels !== 1 ? "ão" : ""} gerada${totalLabels !== 1 ? "s" : ""}.`}
            </p>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={totalLabels === 0 || generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-green hover:bg-brand-green-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors duration-200 text-sm"
            >
              {generating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Gerar PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Product Row ──────────────────────────────────────────────────────────────

interface ProductRowProps {
  product: Product;
  selectedItems: Map<string, SelectedItem>;
  expanded: boolean;
  onToggleExpand: (productId: string) => void;
  onToggleItem: (productId: string, variantId?: string) => void;
  onUpdateQuantity: (productId: string, variantId: string | undefined, quantity: number) => void;
  onSelectAllVariants: (product: Product) => void;
}

function ProductRow({
  product,
  selectedItems,
  expanded,
  onToggleExpand,
  onToggleItem,
  onUpdateQuantity,
  onSelectAllVariants,
}: ProductRowProps) {
  const hasVariants = product.has_variants && (product.variants?.length ?? 0) > 0;
  const isSelected = selectedItems.has(itemKey(product.id));
  const selectedVariantCount = hasVariants
    ? product.variants!.filter((v) => selectedItems.has(itemKey(product.id, v.id))).length
    : 0;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
        {/* Expand toggle for variants */}
        {hasVariants ? (
          <button
            type="button"
            onClick={() => onToggleExpand(product.id)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Checkbox */}
        {hasVariants ? (
          <button
            type="button"
            onClick={() => onSelectAllVariants(product)}
            className={`w-5 h-5 rounded border flex items-center justify-center text-xs transition-colors ${
              selectedVariantCount === product.variants!.length
                ? "bg-brand-green border-brand-green text-white"
                : selectedVariantCount > 0
                  ? "bg-brand-green/30 border-brand-green text-white"
                  : "border-white/20 hover:border-white/40"
            }`}
            title="Selecionar todas as variantes"
          >
            {selectedVariantCount > 0 ? "✓" : ""}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onToggleItem(product.id)}
            className={`w-5 h-5 rounded border flex items-center justify-center text-xs transition-colors ${
              isSelected
                ? "bg-brand-green border-brand-green text-white"
                : "border-white/20 hover:border-white/40"
            }`}
          >
            {isSelected ? "✓" : ""}
          </button>
        )}

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">
            {product.name}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {product.barcode}
            {hasVariants && (
              <span className="ml-2 text-brand-green/70">
                {product.variants!.length} variante{product.variants!.length !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>

        {/* Price */}
        <span className="text-sm text-slate-300 font-medium whitespace-nowrap">
          {formatPrice(product.sell_price)}
        </span>

        {/* Quantity (only for simple products) */}
        {!hasVariants && isSelected && (
          <QuantityControl
            quantity={selectedItems.get(itemKey(product.id))?.quantity ?? 1}
            onChange={(q) => onUpdateQuantity(product.id, undefined, q)}
          />
        )}
      </div>

      {/* Variants */}
      {hasVariants && expanded && (
        <div className="bg-white/[0.02]">
          {product.variants!.map((variant) => (
            <VariantRow
              key={variant.id}
              variant={variant}
              productId={product.id}
              productPrice={product.sell_price}
              selected={selectedItems.has(itemKey(product.id, variant.id))}
              quantity={selectedItems.get(itemKey(product.id, variant.id))?.quantity ?? 1}
              onToggle={() => onToggleItem(product.id, variant.id)}
              onUpdateQuantity={(q) =>
                onUpdateQuantity(product.id, variant.id, q)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Variant Row ──────────────────────────────────────────────────────────────

interface VariantRowProps {
  variant: ProductVariant;
  productId: string;
  productPrice: number;
  selected: boolean;
  quantity: number;
  onToggle: () => void;
  onUpdateQuantity: (quantity: number) => void;
}

function VariantRow({
  variant,
  productPrice,
  selected,
  quantity,
  onToggle,
  onUpdateQuantity,
}: VariantRowProps) {
  const price = variant.sell_price ?? productPrice;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 pl-12 hover:bg-white/5 transition-colors">
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors ${
          selected
            ? "bg-brand-green border-brand-green text-white"
            : "border-white/20 hover:border-white/40"
        }`}
      >
        {selected ? "✓" : ""}
      </button>

      {/* Variant Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-300">
          <span className="font-medium">{variant.size}</span>
          {variant.color && (
            <span className="text-slate-500 ml-1.5">/ {variant.color}</span>
          )}
        </p>
        <p className="text-[10px] text-slate-500">{variant.sku}</p>
      </div>

      {/* Price */}
      <span className="text-xs text-slate-400 whitespace-nowrap">
        {formatPrice(price)}
      </span>

      {/* Quantity */}
      {selected && (
        <QuantityControl quantity={quantity} onChange={onUpdateQuantity} />
      )}
    </div>
  );
}

// ─── Quantity Control ─────────────────────────────────────────────────────────

interface QuantityControlProps {
  quantity: number;
  onChange: (quantity: number) => void;
}

function QuantityControl({ quantity, onChange }: QuantityControlProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <Minus size={12} />
      </button>
      <input
        type="number"
        value={quantity}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(v);
        }}
        className="w-10 text-center text-xs bg-white/5 border border-white/10 rounded py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-green/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min={1}
        max={100}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(quantity + 1, 100))}
        className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-xs text-slate-300 group-hover:text-slate-200 transition-colors">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
          checked ? "bg-brand-green" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

// ─── Number Input ─────────────────────────────────────────────────────────────

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function NumberInput({ label, value, onChange, min, max, step = 1 }: NumberInputProps) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 block mb-0.5">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        min={min}
        max={max}
        step={step}
        className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-brand-green/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}
