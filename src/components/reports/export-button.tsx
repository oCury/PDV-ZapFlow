"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

interface ExportButtonProps {
  reportType: "abc" | "margin" | "turnover" | "stale";
  startDate: string;
  endDate: string;
}

export function ExportButton({
  reportType,
  startDate,
  endDate,
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        reportType,
        format: "csv",
        startDate,
        endDate,
      });

      const response = await fetch(`/api/reports/export?${params}`);
      if (!response.ok) {
        throw new Error("Falha ao exportar");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ?? `relatorio-${reportType}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-green text-primary-dark font-semibold text-sm hover:bg-brand-green-hover transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Download size={16} />
      )}
      Exportar CSV
    </button>
  );
}
