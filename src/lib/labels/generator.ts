import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import type { LabelItemData, LabelTemplate } from "@/lib/validations/labels";

// ─── Predefined Templates ───────────────────────────────────────────────────

const TEMPLATES: Record<string, LabelTemplate> = {
  "40x25": {
    widthMm: 40,
    heightMm: 25,
    columns: 3,
    rows: 10,
    fontSize: 8,
    showPrice: true,
    showBarcode: true,
    showSize: true,
    showColor: true,
  },
  "50x30": {
    widthMm: 50,
    heightMm: 30,
    columns: 2,
    rows: 8,
    fontSize: 8,
    showPrice: true,
    showBarcode: true,
    showSize: true,
    showColor: true,
  },
};

export function getTemplate(templateId: string): LabelTemplate {
  return TEMPLATES[templateId] ?? TEMPLATES["40x25"];
}

export const PREDEFINED_TEMPLATES = TEMPLATES;

// ─── Barcode Generation ─────────────────────────────────────────────────────

function isEan13(code: string): boolean {
  return /^\d{13}$/.test(code);
}

function generateBarcodeDataUrl(barcode: string): string | null {
  if (!barcode) return null;

  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, barcode, {
      format: isEan13(barcode) ? "EAN13" : "CODE128",
      displayValue: false,
      width: 1.5,
      height: 40,
      margin: 0,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// ─── Text Helpers ───────────────────────────────────────────────────────────

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── PDF Generator ──────────────────────────────────────────────────────────

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const PADDING_MM = 1.5;

export function generateLabelsPDF(
  items: readonly LabelItemData[],
  template: LabelTemplate,
): jsPDF {
  const { widthMm, heightMm, columns, rows, fontSize, showPrice, showBarcode, showSize, showColor } = template;

  const labelsPerPage = columns * rows;

  const totalWidth = columns * widthMm;
  const totalHeight = rows * heightMm;
  const marginLeft = (PAGE_WIDTH_MM - totalWidth) / 2;
  const marginTop = (PAGE_HEIGHT_MM - totalHeight) / 2;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFont("helvetica");

  // Expand items by quantity into a flat list of labels
  const labels: LabelItemData[] = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      labels.push(item);
    }
  }

  // Pre-generate barcodes for unique codes
  const barcodeCache = new Map<string, string | null>();
  if (showBarcode) {
    for (const item of items) {
      if (item.barcode && !barcodeCache.has(item.barcode)) {
        barcodeCache.set(item.barcode, generateBarcodeDataUrl(item.barcode));
      }
    }
  }

  let labelIndex = 0;

  while (labelIndex < labels.length) {
    if (labelIndex > 0) {
      doc.addPage();
    }

    const pageLabels = labels.slice(labelIndex, labelIndex + labelsPerPage);

    for (let i = 0; i < pageLabels.length; i++) {
      const label = pageLabels[i];
      const col = i % columns;
      const row = Math.floor(i / columns);

      const x = marginLeft + col * widthMm + PADDING_MM;
      const y = marginTop + row * heightMm + PADDING_MM;
      const innerWidth = widthMm - PADDING_MM * 2;
      const innerHeight = heightMm - PADDING_MM * 2;

      renderLabel(doc, label, x, y, innerWidth, innerHeight, fontSize, showPrice, showBarcode, showSize, showColor, barcodeCache);
    }

    labelIndex += labelsPerPage;
  }

  return doc;
}

function renderLabel(
  doc: jsPDF,
  label: LabelItemData,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  showPrice: boolean,
  showBarcode: boolean,
  showSize: boolean,
  showColor: boolean,
  barcodeCache: Map<string, string | null>,
): void {
  let currentY = y;
  const lineHeight = fontSize * 0.4;
  const maxChars = Math.floor(width / (fontSize * 0.25));

  // Product name
  doc.setFontSize(fontSize);
  doc.setFont("helvetica", "bold");
  const truncatedName = truncateText(label.name, maxChars);
  doc.text(truncatedName, x, currentY + lineHeight);
  currentY += lineHeight + 0.8;

  // Size + Color line
  if ((showSize || showColor) && (label.size || label.color)) {
    doc.setFontSize(fontSize - 1);
    doc.setFont("helvetica", "normal");
    const parts: string[] = [];
    if (showSize && label.size) parts.push(`Tam: ${label.size}`);
    if (showColor && label.color) parts.push(`Cor: ${label.color}`);
    doc.text(parts.join(" | "), x, currentY + lineHeight);
    currentY += lineHeight + 0.5;
  }

  // Price
  if (showPrice) {
    doc.setFontSize(fontSize + 1);
    doc.setFont("helvetica", "bold");
    doc.text(formatPrice(label.price), x, currentY + lineHeight);
    currentY += lineHeight + 0.8;
  }

  // Barcode image
  if (showBarcode && label.barcode) {
    const barcodeDataUrl = barcodeCache.get(label.barcode) ?? null;
    if (barcodeDataUrl) {
      const barcodeWidth = Math.min(width, 30);
      const barcodeHeight = Math.min(height - (currentY - y) - lineHeight - 1, 8);
      if (barcodeHeight > 2) {
        doc.addImage(barcodeDataUrl, "PNG", x, currentY + 0.3, barcodeWidth, barcodeHeight);
        currentY += barcodeHeight + 0.5;
      }
    }
  }

  // SKU / barcode text (small reference)
  const refText = label.sku || label.barcode;
  if (refText) {
    const remainingSpace = height - (currentY - y);
    if (remainingSpace > lineHeight) {
      doc.setFontSize(fontSize - 2);
      doc.setFont("helvetica", "normal");
      doc.text(truncateText(refText, maxChars + 5), x, currentY + lineHeight * 0.8);
    }
  }
}
