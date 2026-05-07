const BOM = "\uFEFF";

export function generateCsv(
  headers: { key: string; label: string }[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: readonly Record<string, any>[]
): string {
  const headerLine = headers.map((h) => `"${h.label}"`).join(";");

  const dataLines = rows.map((row) =>
    headers
      .map((h) => {
        const value = row[h.key];
        if (value === null || value === undefined) return '""';
        if (typeof value === "number") {
          return `"${value.toString().replace(".", ",")}"`;
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(";")
  );

  return BOM + [headerLine, ...dataLines].join("\r\n");
}

export function createCsvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
