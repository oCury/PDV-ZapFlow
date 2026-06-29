import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { exportReportSchema } from "@/lib/validations/reports";
import { requireEntitlement } from "@/lib/entitlements-guard";
import { calculateAbcCurve } from "@/lib/reports/abc-curve";
import { calculateProfitMargin } from "@/lib/reports/profit-margin";
import { calculateStockTurnover } from "@/lib/reports/stock-turnover";
import { calculateStaleProducts } from "@/lib/reports/stale-products";
import { generateCsv, createCsvResponse } from "@/lib/reports/export-csv";

const ABC_HEADERS = [
  { key: "productName", label: "Produto" },
  { key: "category", label: "Categoria" },
  { key: "revenue", label: "Faturamento" },
  { key: "percentage", label: "%" },
  { key: "cumulativePercentage", label: "% Acumulado" },
  { key: "classification", label: "Classificacao" },
  { key: "quantitySold", label: "Qtd Vendida" },
];

const MARGIN_HEADERS = [
  { key: "productName", label: "Produto" },
  { key: "costPrice", label: "Custo" },
  { key: "sellPrice", label: "Preco Venda" },
  { key: "margin", label: "Margem R$" },
  { key: "marginPercent", label: "Margem %" },
  { key: "quantitySold", label: "Qtd Vendida" },
  { key: "totalRevenue", label: "Faturamento Total" },
  { key: "totalProfit", label: "Lucro Total" },
];

const TURNOVER_HEADERS = [
  { key: "productName", label: "Produto" },
  { key: "size", label: "Tamanho" },
  { key: "color", label: "Cor" },
  { key: "quantitySold", label: "Qtd Vendida" },
  { key: "currentStock", label: "Estoque Atual" },
  { key: "turnoverRate", label: "Giro" },
];

const STALE_HEADERS = [
  { key: "productName", label: "Produto" },
  { key: "size", label: "Tamanho" },
  { key: "color", label: "Cor" },
  { key: "stock", label: "Estoque" },
  { key: "lastSaleDate", label: "Ultima Venda" },
  { key: "daysSinceLastSale", label: "Dias Parado" },
];

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("reports.advanced");
  if (gate) return gate;

  const { searchParams } = new URL(req.url);
  const parsed = exportReportSchema.safeParse({
    reportType: searchParams.get("reportType") ?? "",
    format: searchParams.get("format") ?? "csv",
    startDate: searchParams.get("startDate") ?? "",
    endDate: searchParams.get("endDate") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Parametros invalidos" },
      { status: 400 }
    );
  }

  const { reportType, startDate, endDate } = parsed.data;
  const start = new Date(startDate);
  const end = new Date(`${endDate}T23:59:59.999Z`);

  try {
    switch (reportType) {
      case "abc": {
        const data = await calculateAbcCurve({ startDate: start, endDate: end });
        const csv = generateCsv(ABC_HEADERS, data);
        return createCsvResponse(csv, `curva-abc-${startDate}-${endDate}.csv`);
      }
      case "margin": {
        const data = await calculateProfitMargin({ startDate: start, endDate: end });
        const csv = generateCsv(MARGIN_HEADERS, data);
        return createCsvResponse(csv, `margem-lucro-${startDate}-${endDate}.csv`);
      }
      case "turnover": {
        const data = await calculateStockTurnover({ startDate: start, endDate: end });
        const csv = generateCsv(TURNOVER_HEADERS, data);
        return createCsvResponse(csv, `giro-estoque-${startDate}-${endDate}.csv`);
      }
      case "stale": {
        const data = await calculateStaleProducts({ days: 30 });
        const csv = generateCsv(STALE_HEADERS, data);
        return createCsvResponse(csv, `produtos-parados.csv`);
      }
      default:
        return NextResponse.json(
          { error: "Tipo de relatorio invalido." },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Reports] Export error:", error);
    return NextResponse.json(
      { error: "Erro ao exportar relatorio." },
      { status: 500 }
    );
  }
}
