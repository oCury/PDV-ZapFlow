"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, Package, Receipt, Settings } from "lucide-react";
import { useEffect, useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof ShoppingCart;
  adminOnly: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/pdv", label: "PDV", icon: ShoppingCart, adminOnly: false },
  { href: "/products", label: "Produtos", icon: Package, adminOnly: false },
  { href: "/sales", label: "Vendas", icon: Receipt, adminOnly: true },
  { href: "/settings", label: "Config.", icon: Settings, adminOnly: true },
];

export function BottomNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<"ADMIN" | "EMPLOYEE" | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.user?.role) setRole(d.user.role); })
      .catch(() => {});
  }, []);

  const visible = NAV_ITEMS.filter(
    (item) => !item.adminOnly || role === "ADMIN"
  );

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700/60 flex items-stretch safe-area-bottom"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {visible.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors ${
              isActive
                ? "text-brand-green"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-green rounded-full" />
            )}
            <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] font-semibold leading-none">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
