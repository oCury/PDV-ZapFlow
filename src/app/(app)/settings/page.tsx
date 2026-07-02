"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Monitor,
  Moon,
  Sun,
  Palette,
  Store,
  MessageCircle,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Send,
  QrCode,
  Wifi,
  WifiOff,
  Plus,
  Server,
  CreditCard,
  ChevronRight,
} from "lucide-react";

type ThemeOption = "light" | "dark" | "system";

const themeOptions: { value: ThemeOption; label: string; icon: typeof Moon }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // WhatsApp state
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [instanceConnected, setInstanceConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const [loadingQR, setLoadingQR] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const [activeInstanceName, setActiveInstanceName] = useState("");
  const [instanceExists, setInstanceExists] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [availableInstances, setAvailableInstances] = useState<string[]>([]);
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [instanceResult, setInstanceResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
    help?: string;
  } | null>(null);

  const [testNumber, setTestNumber] = useState("");
  const [testMessage, setTestMessage] = useState(
    "Olá! Esta é uma mensagem de teste do PDV ZapFlow."
  );
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  // ─── Load WhatsApp state on mount ────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // 1. Load saved instance from settings
        let savedInstance = "";
        try {
          const r = await fetch("/api/settings");
          if (!cancelled) {
            const d = await r.json();
            savedInstance = d?.settings?.whatsapp_instance || "";
          }
        } catch {
          // intentionally ignored
        }

        if (cancelled) return;

        // 2. Check Evolution API
        const apiRes = await fetch("/api/whatsapp/instance");
        const apiData = await apiRes.json();

        if (cancelled) return;

        if (apiData.configured && apiData.reachable) {
          setApiReachable(true);
          if (apiData.instances) {
            setAvailableInstances(
              apiData.instances.map((i: { instanceName: string }) => i.instanceName)
            );
          }
        } else {
          setApiReachable(false);
          setLoading(false);
          return;
        }

        // 3. Check saved instance status
        if (savedInstance) {
          setActiveInstanceName(savedInstance);
          setInstanceExists(true);
          try {
            const statusRes = await fetch(
              `/api/whatsapp/status?instance=${encodeURIComponent(savedInstance)}`
            );
            const statusData = await statusRes.json();
            if (!cancelled) {
              setInstanceConnected(statusData.connected || false);
              if (statusData.connected) setQrCode(null);
            }
          } catch {
            if (!cancelled) setInstanceConnected(false);
          }
        }
      } catch {
        if (!cancelled) {
          setApiReachable(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Poll connection while disconnected ──────────────────────
  useEffect(() => {
    if (!apiReachable || instanceConnected || !activeInstanceName || !instanceExists) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/whatsapp/status?instance=${encodeURIComponent(activeInstanceName)}`
        );
        const data = await res.json();
        if (data.connected) {
          setInstanceConnected(true);
          setQrCode(null);
          setQrError(null);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [apiReachable, instanceConnected, activeInstanceName, instanceExists]);

  // ─── Actions ─────────────────────────────────────────────────
  const reload = async () => {
    setLoading(true);
    setApiReachable(null);

    try {
      const apiRes = await fetch("/api/whatsapp/instance");
      const apiData = await apiRes.json();

      if (apiData.configured && apiData.reachable) {
        setApiReachable(true);

        if (activeInstanceName) {
          try {
            const statusRes = await fetch(
              `/api/whatsapp/status?instance=${encodeURIComponent(activeInstanceName)}`
            );
            const statusData = await statusRes.json();
            setInstanceConnected(statusData.connected || false);
          } catch {
            setInstanceConnected(false);
          }
        }
      } else {
        setApiReachable(false);
      }
    } catch {
      setApiReachable(false);
    } finally {
      setLoading(false);
    }
  };

  const saveInstanceToSettings = async (name: string) => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { whatsapp_instance: name } }),
      });
    } catch {
      // intentionally ignored
    }
  };

  const selectExistingInstance = async (name: string) => {
    setCreatingInstance(true);
    setInstanceResult(null);

    try {
      const statusRes = await fetch(
        `/api/whatsapp/status?instance=${encodeURIComponent(name)}`
      );
      const statusData = await statusRes.json();

      setActiveInstanceName(name);
      setInstanceExists(true);
      setInstanceConnected(statusData.connected || false);
      setNewInstanceName("");
      saveInstanceToSettings(name);
      setInstanceResult({
        success: true,
        message: statusData.connected
          ? `Conectado à instância "${name}"!`
          : `Instância "${name}" selecionada. Clique em "Gerar QR Code" para conectar.`,
      });
    } catch {
      // Even if status check fails, select the instance
      setActiveInstanceName(name);
      setInstanceExists(true);
      setInstanceConnected(false);
      setNewInstanceName("");
      saveInstanceToSettings(name);
      setInstanceResult({
        success: true,
        message: `Instância "${name}" selecionada. Clique em "Gerar QR Code" para conectar.`,
      });
    } finally {
      setCreatingInstance(false);
    }
  };

  const createOrSelectInstance = async () => {
    const name = newInstanceName.trim();
    if (!name) {
      setInstanceResult({ success: false, message: "Digite um nome para a instância" });
      return;
    }

    // If it already exists on the server, just select it
    if (availableInstances.some((i) => i.toLowerCase() === name.toLowerCase())) {
      const exactName = availableInstances.find(
        (i) => i.toLowerCase() === name.toLowerCase()
      )!;
      await selectExistingInstance(exactName);
      return;
    }

    // Otherwise create a new one
    setCreatingInstance(true);
    setInstanceResult(null);

    try {
      const res = await fetch("/api/whatsapp/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName: name }),
      });
      const data = await res.json();

      if (data.success || res.status === 409) {
        setInstanceResult({
          success: true,
          message: res.status === 409
            ? `Instância "${name}" já existe. Conecte via QR Code.`
            : `Instância "${name}" criada! Clique em "Gerar QR Code" para conectar.`,
        });
        setActiveInstanceName(name);
        setInstanceExists(true);
        setInstanceConnected(false);
        setNewInstanceName("");
        saveInstanceToSettings(name);
      } else {
        setInstanceResult({
          success: false,
          message: data.error || "Erro ao criar instância",
          details: data.details,
          help: data.help,
        });
      }
    } catch {
      setInstanceResult({ success: false, message: "Erro de conexão com o servidor" });
    } finally {
      setCreatingInstance(false);
    }
  };

  const getQRCode = async () => {
    if (!activeInstanceName) {
      setQrError("Nenhuma instância ativa.");
      return;
    }

    setLoadingQR(true);
    setQrError(null);
    try {
      const res = await fetch(
        `/api/whatsapp/connect?instance=${encodeURIComponent(activeInstanceName)}`
      );
      const data = await res.json();

      if (data.connected) {
        setInstanceConnected(true);
        setQrCode(null);
        return;
      }
      if (data.qrcode) {
        setQrCode(data.qrcode);
      } else if (data.error) {
        setQrError(data.error + (data.details ? ` (${data.details})` : ""));
      }
    } catch {
      setQrError("Erro de conexão com o servidor");
    } finally {
      setLoadingQR(false);
    }
  };

  const switchInstance = async () => {
    await saveInstanceToSettings("");
    setActiveInstanceName("");
    setInstanceExists(false);
    setInstanceConnected(false);
    setInstanceResult(null);
    setQrCode(null);
    setQrError(null);
  };

  const sendTestMessage = async () => {
    if (!testNumber.trim() || !activeInstanceName) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: testNumber,
          message: testMessage,
          type: "text",
          instanceName: activeInstanceName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: "Mensagem enviada com sucesso!" });
        setTestNumber("");
      } else {
        setTestResult({ success: false, message: data.error || "Erro ao enviar" });
      }
    } catch {
      setTestResult({ success: false, message: "Erro de conexão" });
    } finally {
      setSendingTest(false);
    }
  };

  // Derived
  const isLoading = loading;
  const statusText = isLoading
    ? "Verificando..."
    : instanceConnected
    ? "Conectado"
    : apiReachable
    ? instanceExists
      ? "Desconectado"
      : "Sem instância"
    : "API não acessível";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold theme-text-primary">Configurações</h1>
        <p className="theme-text-secondary text-sm mt-1">
          Personalize o sistema conforme suas preferências
        </p>
      </div>

      {/* ── Appearance ─────────────────────────────────────────────── */}
      <section className="theme-bg-surface rounded-2xl border theme-border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b theme-border">
          <div className="p-2 bg-brand-green/10 rounded-xl">
            <Palette size={18} className="text-brand-green" />
          </div>
          <div>
            <h2 className="font-semibold theme-text-primary text-sm">Aparência</h2>
            <p className="theme-text-secondary text-xs">Escolha o tema da interface</p>
          </div>
        </div>
        <div className="p-6">
          {mounted ? (
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map(({ value, label, icon: Icon }) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all duration-200 ${
                      active
                        ? "border-brand-green bg-brand-green/10 text-brand-green"
                        : "theme-border theme-bg-surface-2 theme-text-secondary hover:border-slate-500"
                    }`}
                  >
                    <Icon size={22} />
                    <span className="text-sm font-medium">{label}</span>
                    {active && (
                      <span className="text-[10px] font-bold bg-brand-green/20 text-brand-green px-2 py-0.5 rounded-full">
                        Ativo
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map(({ label }) => (
                <div
                  key={label}
                  className="h-[100px] rounded-xl border-2 border-slate-700 bg-slate-700/50 animate-pulse"
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── WhatsApp / Evolution API ────────────────────────────────── */}
      <section className="theme-bg-surface rounded-2xl border theme-border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b theme-border">
          <div className="p-2 bg-green-500/10 rounded-xl">
            <MessageCircle size={18} className="text-green-500" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold theme-text-primary text-sm">
              WhatsApp (Evolution API)
            </h2>
            <p className="theme-text-secondary text-xs">
              Envie mensagens e notificações via WhatsApp
            </p>
          </div>
          <button
            onClick={reload}
            disabled={isLoading}
            className="p-2 theme-text-secondary hover:theme-text-primary hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Bar */}
          <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-xl">
            <div className="flex items-center gap-3">
              {isLoading ? (
                <Loader2 size={20} className="text-slate-400 animate-spin" />
              ) : instanceConnected ? (
                <Wifi size={20} className="text-green-500" />
              ) : apiReachable ? (
                <WifiOff size={20} className="text-yellow-500" />
              ) : (
                <XCircle size={20} className="text-red-500" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-200">{statusText}</p>
                <p className="text-xs text-slate-500">
                  {activeInstanceName ? `Instância: ${activeInstanceName}` : ""}
                </p>
              </div>
            </div>
            {instanceConnected && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-500 bg-green-500/10 px-3 py-1.5 rounded-full">
                <CheckCircle size={12} />
                Online
              </span>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={24} className="text-slate-400 animate-spin" />
            </div>
          )}

          {/* API Not Reachable */}
          {!isLoading && apiReachable === false && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
              <p className="text-sm text-amber-400 font-medium">
                Evolution API não acessível
              </p>
              <p className="text-xs text-slate-400">
                Verifique se o servidor Evolution API está online e se as variáveis
                de ambiente estão corretas no <code className="bg-slate-800 px-1.5 py-0.5 rounded">.env</code>
              </p>
              <button
                onClick={reload}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <RefreshCw size={14} />
                Tentar novamente
              </button>
            </div>
          )}

          {/* API Reachable — Instance Management */}
          {!isLoading && apiReachable === true && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-slate-400" />
                <h3 className="text-sm font-medium text-slate-200">Instância deste PDV</h3>
              </div>

              {/* Instance Result Messages */}
              {instanceResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    instanceResult.success
                      ? "bg-green-500/10 border border-green-500/30"
                      : "bg-red-500/10 border border-red-500/30"
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 ${instanceResult.success ? "text-green-400" : "text-red-400"}`}
                  >
                    {instanceResult.success ? (
                      <CheckCircle size={16} />
                    ) : (
                      <XCircle size={16} />
                    )}
                    <span className="font-medium">{instanceResult.message}</span>
                  </div>
                  {instanceResult.details && (
                    <p className="text-xs text-slate-400 mt-2 ml-6">
                      {instanceResult.details}
                    </p>
                  )}
                  {instanceResult.help && (
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                      {instanceResult.help}
                    </p>
                  )}
                </div>
              )}

              {/* Active Instance Card */}
              {instanceExists && activeInstanceName && (
                <div
                  className={`p-4 rounded-xl border-2 ${
                    instanceConnected
                      ? "bg-green-500/10 border-green-500/50"
                      : "bg-slate-700/50 border-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-lg ${
                          instanceConnected ? "bg-green-500/20" : "bg-slate-600"
                        }`}
                      >
                        {instanceConnected ? (
                          <Wifi size={20} className="text-green-500" />
                        ) : (
                          <WifiOff size={20} className="text-yellow-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {activeInstanceName}
                        </p>
                        <p
                          className={`text-xs ${instanceConnected ? "text-green-400" : "text-yellow-400"}`}
                        >
                          {instanceConnected
                            ? "Conectado e pronto para uso"
                            : 'Clique em "Gerar QR Code" para conectar'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={switchInstance}
                      className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 hover:bg-slate-600 rounded-lg transition-colors"
                    >
                      Trocar
                    </button>
                  </div>
                </div>
              )}

              {/* QR Code Section */}
              {instanceExists && activeInstanceName && !instanceConnected && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">
                      Escaneie o QR Code com seu WhatsApp para conectar
                    </p>
                    <button
                      onClick={getQRCode}
                      disabled={loadingQR}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loadingQR ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <QrCode size={16} />
                      )}
                      {qrCode ? "Atualizar QR" : "Gerar QR Code"}
                    </button>
                  </div>

                  {qrError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                      <p className="text-sm text-red-400 font-medium mb-1">
                        Erro ao gerar QR Code:
                      </p>
                      <p className="text-xs text-red-300">{qrError}</p>
                    </div>
                  )}

                  {qrCode && (
                    <div className="flex justify-center p-6 bg-white rounded-xl">
                      <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
                    </div>
                  )}
                </div>
              )}

              {/* Create or Connect Instance */}
              {!instanceExists && (
                <div className="p-4 bg-slate-700/50 rounded-xl space-y-3">
                  <label className="block text-sm font-medium text-slate-300">
                    Nome da Instância
                  </label>
                  <p className="text-xs text-slate-400">
                    Digite o nome da instância. Se já existir, será conectada automaticamente.
                  </p>
                  <input
                    type="text"
                    placeholder="Digite o nome da instância..."
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newInstanceName.trim()) createOrSelectInstance();
                    }}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-green-500"
                  />
                  <button
                    onClick={createOrSelectInstance}
                    disabled={creatingInstance || !newInstanceName.trim()}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {creatingInstance ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    {availableInstances.some(
                      (i) => i.toLowerCase() === newInstanceName.trim().toLowerCase()
                    )
                      ? "Conectar à Instância"
                      : "Criar Instância"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Test Message */}
          {instanceConnected && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <h3 className="text-sm font-medium text-slate-200">
                Enviar mensagem de teste
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Número (ex: 5511999999999)"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-green-500"
                />
                <textarea
                  placeholder="Mensagem"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-green-500 resize-none"
                />
                <button
                  onClick={sendTestMessage}
                  disabled={sendingTest || !testNumber.trim()}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
                >
                  {sendingTest ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                  Enviar Teste
                </button>
              </div>
              {testResult && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    testResult.success
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                  {testResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Terminals ──────────────────────────────────────────────── */}
      <Link href="/settings/terminals">
        <section className="theme-bg-surface rounded-2xl border theme-border overflow-hidden hover:border-brand-green/50 transition-colors cursor-pointer">
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="p-2 bg-brand-green/10 rounded-xl">
              <CreditCard size={18} className="text-brand-green" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold theme-text-primary text-sm">Maquininhas</h2>
              <p className="theme-text-secondary text-xs">
                Sincronize e gerencie os terminais Mercado Pago Point
              </p>
            </div>
            <ChevronRight size={18} className="text-slate-400" />
          </div>
        </section>
      </Link>

      {/* ── Store Settings (placeholder) ───────────────────────────── */}
      <section className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden opacity-60">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
          <div className="p-2 bg-slate-700 rounded-xl">
            <Store size={18} className="text-slate-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-100 text-sm">Configurações da Loja</h2>
            <p className="text-slate-500 text-xs">Nome, CNPJ, endereço e dados fiscais</p>
          </div>
          <span className="text-[10px] font-bold bg-slate-700 text-slate-400 px-2.5 py-1 rounded-full">
            Em breve
          </span>
        </div>
        <div className="px-6 py-8 text-center text-slate-600 text-sm">
          Configurações da loja serão adicionadas em breve.
        </div>
      </section>
    </div>
  );
}
