"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  Settings,
  Users,
  UserCheck,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MessageCircle,
  Gift,
  FolderTree,
  FileText,
  Percent,
  ArrowLeftRight,
  Ticket,
  Tag,
  Truck,
  BarChart3,
  Lock,
} from "lucide-react";
import type { EntitlementKey } from "@/lib/entitlements";
import { useState, useEffect, useRef } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly: boolean;
  entitlement?: EntitlementKey;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/pdv", label: "PDV", icon: ShoppingCart, adminOnly: false },
  { href: "/tables", label: "Mesas", icon: UtensilsCrossed, adminOnly: false, entitlement: "tables" },
  { href: "/entregas", label: "Entregas", icon: Truck, adminOnly: false, entitlement: "deliveries" },
  { href: "/products", label: "Produtos", icon: Package, adminOnly: false },
  { href: "/categories", label: "Categorias", icon: FolderTree, adminOnly: true },
  { href: "/customers", label: "Clientes", icon: UserCheck, adminOnly: true },
  { href: "/cashback", label: "Cashback", icon: Gift, adminOnly: true, entitlement: "loyalty" },
  { href: "/sales", label: "Vendas", icon: Receipt, adminOnly: true },
  { href: "/exchanges", label: "Trocas", icon: ArrowLeftRight, adminOnly: true, entitlement: "vouchers" },
  { href: "/vouchers", label: "Vales", icon: Ticket, adminOnly: true, entitlement: "vouchers" },
  { href: "/commissions", label: "Comissões", icon: Percent, adminOnly: true, entitlement: "commissions" },
  { href: "/labels", label: "Etiquetas", icon: Tag, adminOnly: true, entitlement: "labels" },
  { href: "/reports", label: "Relatórios", icon: BarChart3, adminOnly: true, entitlement: "reports.advanced" },
  { href: "/fiscal", label: "Fiscal", icon: FileText, adminOnly: true, entitlement: "fiscal.nfce" },
  { href: "/followups", label: "Follow-up", icon: MessageCircle, adminOnly: true, entitlement: "whatsapp" },
  { href: "/staff", label: "Equipe", icon: Users, adminOnly: true },
  { href: "/settings", label: "Configurações", icon: Settings, adminOnly: true },
];

interface UserInfo {
  name: string;
  role: "ADMIN" | "EMPLOYEE";
  entitlements: EntitlementKey[];
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);

  const userFetched = useRef(false);

  useEffect(() => {
    if (userFetched.current) return;
    userFetched.current = true;

    // Check session cache first
    try {
      const cached = sessionStorage.getItem("sidebar_user");
      if (cached) {
        setUser(JSON.parse(cached));
        return;
      }
    } catch { /* intentionally ignored — sessionStorage may be unavailable */ }

    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          const userInfo: UserInfo = {
            ...data.user,
            entitlements: data.entitlements ?? [],
          };
          setUser(userInfo);
          try { sessionStorage.setItem("sidebar_user", JSON.stringify(userInfo)); } catch { /* intentionally ignored — sessionStorage may be unavailable */ }
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    try { sessionStorage.removeItem("sidebar_user"); } catch { /* intentionally ignored — sessionStorage may be unavailable */ }
    router.push("/login");
    router.refresh();
  };

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "ADMIN"
  );

  const entitlements = user?.entitlements ?? [];
  const isLocked = (item: NavItem) =>
    !!item.entitlement && !entitlements.includes(item.entitlement);

  return (
    <aside
      className={`flex flex-col h-screen bg-primary-dark text-pure-white transition-all duration-300 ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/10">
        {!collapsed && (
          <span className="text-xl font-bold tracking-tight">
            <span className="text-brand-green">PDV</span> System
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">
        {visibleItems.map((item) => {
          const locked = isLocked(item);
          const isActive = !locked && pathname === item.href;
          const href = locked ? `/upgrade?feature=${item.entitlement}` : item.href;
          return (
            <Link
              key={item.href}
              href={href}
              title={locked ? "Disponível em um plano superior" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                locked
                  ? "opacity-50 text-gray-400 hover:text-pure-white hover:bg-white/5"
                  : isActive
                  ? "bg-brand-green text-primary-dark font-semibold"
                  : "text-gray-400 hover:text-pure-white hover:bg-white/5"
              }`}
            >
              <item.icon
                size={20}
                className={
                  isActive
                    ? "text-primary-dark"
                    : "text-gray-400 group-hover:text-pure-white"
                }
              />
              {!collapsed && <span className="text-sm">{item.label}</span>}
              {!collapsed && locked && (
                <Lock size={14} className="ml-auto opacity-70" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4 space-y-3">
        <div className="flex flex-col items-center gap-2">
          <Image
            src="/logo.png"
            alt="ZapFLow Logo"
            width={collapsed ? 40 : 64}
            height={collapsed ? 40 : 64}
            className="rounded-full"
          />
          {!collapsed && (
            <span className="text-xs font-semibold text-center text-gray-300 leading-tight">
              ZapFLow
            </span>
          )}
        </div>

        {user && !collapsed && (
          <div className="text-center">
            <p className="text-xs font-medium text-gray-300">{user.name}</p>
            <span
              className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                user.role === "ADMIN"
                  ? "bg-brand-green/20 text-brand-green"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {user.role === "ADMIN" ? "Admin" : "Funcionário"}
            </span>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors text-sm"
        >
          <LogOut size={16} />
          {!collapsed && <span>Sair</span>}
        </button>

        {!collapsed && (
          <div className="text-xs text-gray-500 text-center">
            PDV System v0.1.0
          </div>
        )}
      </div>
    </aside>
  );
}
