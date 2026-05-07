"use client";

import { X, ExternalLink, Download, Copy, Check } from "lucide-react";
import { useState } from "react";
import { NfceStatusBadge } from "./nfce-status-badge";

interface NfceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: {
    id: string;
    nfce_status: string | null;
    nfce_number: number | null;
    nfce_series: number | null;
    nfce_access_key: string | null;
    nfce_qr_url: string | null;
    nfce_danfe_url: string | null;
    nfce_protocol: string | null;
    nfce_errors: string | null;
    total_amount: number;
    created_at: string;
  };
}

export function NfceDetailsModal({
  isOpen,
  onClose,
  sale,
}: NfceDetailsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const parsedErrors = sale.nfce_errors
    ? (() => {
        try {
          return JSON.parse(sale.nfce_errors) as {
            code: string;
            message: string;
          }[];
        } catch {
          return null;
        }
      })()
    : null;

  const handleCopyKey = async () => {
    if (!sale.nfce_access_key) return;
    await navigator.clipboard.writeText(sale.nfce_access_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-primary-dark border border-white/10 rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-lg font-bold text-pure-white">
            Detalhes NFC-e
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-pure-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Status</span>
            <NfceStatusBadge status={sale.nfce_status} />
          </div>

          {sale.nfce_number != null && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Número / Série</span>
              <span className="text-pure-white font-mono text-sm">
                {sale.nfce_number} / {sale.nfce_series ?? 1}
              </span>
            </div>
          )}

          {sale.nfce_protocol && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Protocolo</span>
              <span className="text-pure-white font-mono text-sm">
                {sale.nfce_protocol}
              </span>
            </div>
          )}

          {sale.nfce_access_key && (
            <div className="space-y-1">
              <span className="text-gray-400 text-sm">Chave de Acesso</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-pure-white font-mono bg-white/5 rounded-xl px-3 py-2 break-all">
                  {sale.nfce_access_key}
                </code>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-pure-white transition-colors"
                  title="Copiar chave"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Valor Total</span>
            <span className="text-pure-white font-bold">
              R$ {Number(sale.total_amount).toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Data da Venda</span>
            <span className="text-pure-white text-sm">
              {new Date(sale.created_at).toLocaleString("pt-BR")}
            </span>
          </div>

          {sale.nfce_qr_url && (
            <a
              href={sale.nfce_qr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-brand-green hover:text-brand-green-hover text-sm font-medium transition-colors"
            >
              <ExternalLink size={16} />
              Consultar QR Code
            </a>
          )}

          {sale.nfce_danfe_url && (
            <a
              href={sale.nfce_danfe_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-brand-green hover:text-brand-green-hover text-sm font-medium transition-colors"
            >
              <Download size={16} />
              Baixar DANFE (PDF)
            </a>
          )}

          {parsedErrors && parsedErrors.length > 0 && (
            <div className="space-y-2">
              <span className="text-red-400 text-sm font-semibold">
                Erros da SEFAZ
              </span>
              <div className="space-y-1">
                {parsedErrors.map((err, i) => (
                  <div
                    key={i}
                    className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400"
                  >
                    <span className="font-mono font-bold">[{err.code}]</span>{" "}
                    {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
