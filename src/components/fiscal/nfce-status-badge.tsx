"use client";

interface NfceStatusBadgeProps {
  status: string | null | undefined;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  authorized: {
    label: "Autorizada",
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  pending: {
    label: "Pendente",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  error: {
    label: "Erro",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  cancelled: {
    label: "Cancelada",
    className: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  },
  contingency: {
    label: "Contingência",
    className: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
};

export function NfceStatusBadge({ status }: NfceStatusBadgeProps) {
  if (!status) return null;

  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.className}`}
    >
      {config.label}
    </span>
  );
}
