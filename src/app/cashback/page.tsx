"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Gift,
  Search,
  Loader2,
  Phone,
  Download,
  DollarSign,
  TrendingUp,
  Users,
  Copy,
  Check,
  Send,
  MessageSquare,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Settings,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface CashbackCustomer {
  id: string;
  name: string | null;
  phone: string;
  whatsapp: string | null;
  loyalty_points: number;
  total_spent: number;
  total_cashback_earned: number;
  total_purchases: number;
  last_purchase: string | null;
}

interface CashbackConfig {
  cashback_percent: number;
  store_name: string;
  whatsapp_instance: string;
  cashback_message: string;
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

const DEFAULT_TEMPLATE =
  `🎉 *Extrato de Cashback - {loja}*\n\n` +
  `Olá, *{nome}*!\n\n` +
  `📊 *Seu resumo de fidelidade:*\n` +
  `━━━━━━━━━━━━━━━━━━\n` +
  `💰 Saldo de cashback: *{cashback}*\n` +
  `🏷️ Pontos acumulados: *{pontos} pts*\n` +
  `🛒 Total em compras: *{total_gasto}*\n` +
  `📅 Última compra: *{ultima_compra}*\n` +
  `━━━━━━━━━━━━━━━━━━\n\n` +
  `💚 A cada compra você ganha *{percentual}%* de cashback!\n` +
  `Use seus pontos como desconto na próxima compra.\n\n` +
  `_Obrigado por ser nosso cliente! 🙏_`;

function buildMessage(
  template: string,
  customer: CashbackCustomer,
  config: CashbackConfig
): string {
  const cashbackAmount = customer.total_spent * (config.cashback_percent / 100);
  return template
    .replace(/{loja}/g, config.store_name)
    .replace(/{nome}/g, customer.name || "Cliente")
    .replace(/{cashback}/g, formatCurrency(cashbackAmount))
    .replace(/{pontos}/g, String(customer.loyalty_points))
    .replace(/{total_gasto}/g, formatCurrency(customer.total_spent))
    .replace(/{compras}/g, String(customer.total_purchases))
    .replace(/{percentual}/g, String(config.cashback_percent))
    .replace(/{ultima_compra}/g, customer.last_purchase ? formatDate(customer.last_purchase) : "—")
    .replace(/{telefone}/g, formatPhone(customer.phone));
}

export default function CashbackPage() {
  const [customers, setCustomers] = useState<CashbackCustomer[]>([]);
  const [config, setConfig] = useState<CashbackConfig>({
    cashback_percent: 10,
    store_name: "Sua Loja",
    whatsapp_instance: "",
    cashback_message: "",
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);

  // Message template
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_TEMPLATE);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [previewCustomer, setPreviewCustomer] = useState<CashbackCustomer | null>(null);

  // Cashback settings
  const [showSettings, setShowSettings] = useState(false);
  const [cashbackPercent, setCashbackPercent] = useState("10");
  const [followupDays, setFollowupDays] = useState("15");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsResult, setSettingsResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchCashback = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cashback");
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers);
        setConfig(data.config);
        if (data.config.cashback_message) {
          setMessageTemplate(data.config.cashback_message);
        }
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success && data.settings) {
        setCashbackPercent(data.settings.cashback_percent || "10");
        setFollowupDays(data.settings.followup_days || "15");
      }
    } catch {
      /* silent */
    }
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    setSettingsResult(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            cashback_percent: cashbackPercent,
            followup_days: followupDays,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSettingsResult({ success: true, message: "Configurações salvas!" });
        fetchCashback();
      } else {
        setSettingsResult({ success: false, message: data.error || "Erro ao salvar" });
      }
    } catch {
      setSettingsResult({ success: false, message: "Erro de conexão" });
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSettingsResult(null), 3000);
    }
  };

  useEffect(() => {
    fetchCashback();
    fetchSettings();
  }, [fetchCashback, fetchSettings]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.name?.toLowerCase().includes(q) ?? false) ||
      c.phone.includes(q)
    );
  });

  const totalPoints = customers.reduce((s, c) => s + c.loyalty_points, 0);
  const totalSpent = customers.reduce((s, c) => s + c.total_spent, 0);
  const totalCashback = totalSpent * (config.cashback_percent / 100);

  const copyMessage = (customer: CashbackCustomer) => {
    const msg = buildMessage(messageTemplate, customer, config);
    navigator.clipboard.writeText(msg);
    setCopiedId(customer.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendViaWhatsApp = async (customer: CashbackCustomer) => {
    const number = customer.whatsapp || customer.phone;
    if (!number) return;

    setSendingId(customer.id);
    setSendResult(null);

    try {
      const msg = buildMessage(messageTemplate, customer, config);
      const body: Record<string, string> = { number, message: msg };
      if (config.whatsapp_instance) {
        body.instanceName = config.whatsapp_instance;
      }

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSendResult({
          id: customer.id,
          success: true,
          message: "Enviado com sucesso!",
        });
      } else {
        setSendResult({
          id: customer.id,
          success: false,
          message: data.error || "Erro ao enviar",
        });
      }
    } catch {
      setSendResult({
        id: customer.id,
        success: false,
        message: "Erro de conexão",
      });
    } finally {
      setSendingId(null);
      setTimeout(() => setSendResult(null), 4000);
    }
  };

  const saveTemplate = async () => {
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { cashback_message: messageTemplate } }),
      });
      if (res.ok) {
        setTemplateSaved(true);
        setTimeout(() => setTemplateSaved(false), 2000);
      }
    } catch {
      /* silent */
    } finally {
      setSavingTemplate(false);
    }
  };

  const resetTemplate = () => {
    setMessageTemplate(DEFAULT_TEMPLATE);
  };

  const downloadReport = () => {
    const lines = [
      `Relatório de Cashback - ${config.store_name}`,
      `Data: ${new Date().toLocaleDateString("pt-BR")}`,
      `Taxa de cashback: ${config.cashback_percent}%`,
      "",
      "Nome;Telefone;Pontos;Total Gasto;Cashback;Compras;Última Compra",
      ...customers.map(
        (c) =>
          `${c.name || "—"};${formatPhone(c.phone)};${c.loyalty_points};${c.total_spent.toFixed(2)};${(c.total_spent * (config.cashback_percent / 100)).toFixed(2)};${c.total_purchases};${c.last_purchase ? formatDate(c.last_purchase) : "—"}`
      ),
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cashback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // For preview, pick first customer or a dummy
  const previewTarget = previewCustomer || filtered[0] || {
    id: "preview",
    name: "João Silva",
    phone: "11999998888",
    whatsapp: null,
    loyalty_points: 150,
    total_spent: 1500,
    total_cashback_earned: 0,
    total_purchases: 12,
    last_purchase: new Date().toISOString(),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Gift size={24} className="text-brand-green" />
            Cashback
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Programa de fidelidade — {config.cashback_percent}% de retorno
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSettings(!showSettings); if (showTemplateEditor) setShowTemplateEditor(false); }}
            className={`px-4 py-2.5 rounded-2xl transition-colors text-sm flex items-center gap-2 border ${
              showSettings
                ? "bg-brand-green/20 border-brand-green/50 text-brand-green"
                : "bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
            } font-semibold`}
          >
            <Settings size={16} />
            Configurações
          </button>
          <button
            onClick={() => { setShowTemplateEditor(!showTemplateEditor); if (showSettings) setShowSettings(false); }}
            className={`px-4 py-2.5 rounded-2xl transition-colors text-sm flex items-center gap-2 border ${
              showTemplateEditor
                ? "bg-brand-green/20 border-brand-green/50 text-brand-green"
                : "bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
            } font-semibold`}
          >
            <MessageSquare size={16} />
            Mensagem
          </button>
          <button
            onClick={downloadReport}
            disabled={customers.length === 0}
            className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-200 font-semibold px-4 py-2.5 rounded-2xl transition-colors text-sm flex items-center gap-2 border border-slate-600"
          >
            <Download size={16} />
            CSV
          </button>
        </div>
      </div>

      {/* Cashback Settings */}
      {showSettings && (
        <section className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700 bg-slate-800/50">
            <Settings size={16} className="text-brand-green" />
            <h2 className="font-semibold text-slate-200 text-sm">Configurações do Cashback</h2>
          </div>

          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Percentual de cashback
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={cashbackPercent}
                    onChange={(e) => setCashbackPercent(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    %
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Percentual do valor da compra dado como cashback (1-50%)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Dias para envio automático
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={followupDays}
                    onChange={(e) => setFollowupDays(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    dias
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Mensagem de cashback enviada após este período (1-90 dias)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="flex items-center gap-1.5 px-4 py-2 bg-brand-green hover:bg-brand-green-hover text-primary-dark text-xs font-bold rounded-xl transition-colors"
              >
                {savingSettings ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Salvar
              </button>

              {settingsResult && (
                <span
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    settingsResult.success ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {settingsResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {settingsResult.message}
                </span>
              )}
            </div>

            <div className="p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl">
              <p className="text-xs text-slate-400">
                O sistema enviará automaticamente uma mensagem de cashback de{" "}
                <strong className="text-brand-green">{cashbackPercent}%</strong> via WhatsApp para
                clientes que compraram há{" "}
                <strong className="text-brand-green">{followupDays} dias</strong>. O envio acontece
                diariamente às 8h.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Message Template Editor */}
      {showTemplateEditor && (
        <section className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700 bg-slate-800/50">
            <MessageSquare size={16} className="text-brand-green" />
            <h2 className="font-semibold text-slate-200 text-sm">Modelo da Mensagem</h2>
            <span className="ml-auto text-[10px] text-slate-500">
              Variáveis: {"{nome}"} {"{cashback}"} {"{pontos}"} {"{total_gasto}"} {"{compras}"} {"{percentual}"} {"{ultima_compra}"} {"{loja}"} {"{telefone}"}
            </span>
          </div>

          <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-700">
            {/* Editor */}
            <div className="p-4 space-y-3">
              <label className="block text-xs font-medium text-slate-400">Editar modelo</label>
              <textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={12}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 p-3 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveTemplate}
                  disabled={savingTemplate}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand-green hover:bg-brand-green-hover text-primary-dark text-xs font-bold rounded-xl transition-colors"
                >
                  {savingTemplate ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : templateSaved ? (
                    <Check size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  {templateSaved ? "Salvo!" : "Salvar"}
                </button>
                <button
                  onClick={resetTemplate}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-xl transition-colors"
                >
                  <RotateCcw size={14} />
                  Restaurar padrão
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">Pré-visualização</label>
                {filtered.length > 0 && (
                  <select
                    value={previewCustomer?.id || ""}
                    onChange={(e) => {
                      const c = customers.find((x) => x.id === e.target.value);
                      setPreviewCustomer(c || null);
                    }}
                    className="text-xs bg-slate-700 border border-slate-600 text-slate-300 rounded-lg px-2 py-1 focus:outline-none"
                  >
                    <option value="">Cliente exemplo</option>
                    {filtered.slice(0, 20).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || formatPhone(c.phone)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                {buildMessage(messageTemplate, previewTarget, config)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-brand-green/20 rounded-lg">
              <Users size={16} className="text-brand-green" />
            </div>
            <span className="text-xs text-slate-400">Clientes Ativos</span>
          </div>
          <p className="text-xl font-bold text-slate-100">{customers.length}</p>
        </div>
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Gift size={16} className="text-emerald-400" />
            </div>
            <span className="text-xs text-slate-400">Pontos em Circulação</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">
            {totalPoints.toLocaleString("pt-BR")} pts
          </p>
        </div>
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <DollarSign size={16} className="text-amber-400" />
            </div>
            <span className="text-xs text-slate-400">Cashback Total</span>
          </div>
          <p className="text-xl font-bold text-amber-400">
            {formatCurrency(totalCashback)}
          </p>
        </div>
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <TrendingUp size={16} className="text-blue-400" />
            </div>
            <span className="text-xs text-slate-400">Total em Vendas</span>
          </div>
          <p className="text-xl font-bold text-blue-400">
            {formatCurrency(totalSpent)}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          type="text"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
        />
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Gift size={48} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">
            {search
              ? "Nenhum cliente encontrado"
              : "Nenhum cliente com compras ainda"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((customer) => (
            <div
              key={customer.id}
              className="bg-slate-800 rounded-2xl border border-slate-700 p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Customer Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-100 truncate">
                      {customer.name || "Sem nome"}
                    </h3>
                    {customer.loyalty_points > 0 && (
                      <span className="shrink-0 text-xs font-bold bg-brand-green/20 text-brand-green px-2 py-0.5 rounded-full">
                        {customer.loyalty_points} pts
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Phone size={12} />
                    {formatPhone(customer.phone)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                    <span>
                      Compras:{" "}
                      <span className="text-slate-300 font-semibold">
                        {customer.total_purchases}
                      </span>
                    </span>
                    <span>
                      Total gasto:{" "}
                      <span className="text-slate-300 font-semibold">
                        {formatCurrency(customer.total_spent)}
                      </span>
                    </span>
                    <span>
                      Cashback:{" "}
                      <span className="text-emerald-400 font-bold">
                        {formatCurrency(customer.total_spent * (config.cashback_percent / 100))}
                      </span>
                    </span>
                    {customer.last_purchase && (
                      <span>
                        Última:{" "}
                        <span className="text-slate-300">
                          {formatDate(customer.last_purchase)}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyMessage(customer)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-xl transition-colors"
                    title="Copiar mensagem"
                  >
                    {copiedId === customer.id ? (
                      <>
                        <Check size={14} className="text-brand-green" />
                        <span className="text-brand-green">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copiar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => sendViaWhatsApp(customer)}
                    disabled={sendingId === customer.id}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white text-xs font-medium rounded-xl transition-colors"
                    title="Enviar via WhatsApp"
                  >
                    {sendingId === customer.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    Enviar
                  </button>
                </div>
              </div>

              {/* Send Result */}
              {sendResult?.id === customer.id && (
                <div
                  className={`mt-2 text-xs font-medium px-3 py-1.5 rounded-lg ${
                    sendResult.success
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {sendResult.message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
