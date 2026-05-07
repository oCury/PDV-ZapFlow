"use client";

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  PENDING: {
    label: "Pendente",
    classes: "bg-yellow-500/20 text-yellow-400",
  },
  APPROVED: {
    label: "Aprovada",
    classes: "bg-blue-500/20 text-blue-400",
  },
  COMPLETED: {
    label: "Concluida",
    classes: "bg-emerald-500/20 text-emerald-400",
  },
  CANCELLED: {
    label: "Cancelada",
    classes: "bg-red-500/20 text-red-400",
  },
};

interface ExchangeStatusBadgeProps {
  status: string;
}

export function ExchangeStatusBadge({ status }: ExchangeStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    classes: "bg-gray-500/20 text-gray-400",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
