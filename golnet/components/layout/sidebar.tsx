"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/predictions", label: "Palpites", icon: "⚽" },
  { href: "/bracket", label: "Chaveamento", icon: "📋" },
  { href: "/leagues", label: "Ligas", icon: "🏆" },
  { href: "/rankings", label: "Ranking", icon: "📊" },
  { href: "/standings", label: "Classificação", icon: "🏅" },
  { href: "/rules", label: "Regras", icon: "📖" },
  { href: "/profile", label: "Perfil", icon: "👤" },
  { href: "/pricing", label: "Planos", icon: "💎" },
  { href: "/support", label: "Suporte", icon: "💬" },
];

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="10 4 6 8 10 12" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const links = isAdmin ? [...nav, { href: "/admin", label: "Admin", icon: "⚙️" }] : nav;

  const isActive = (href: string) =>
    (href !== "/dashboard" && pathname.startsWith(href)) ||
    (href === "/dashboard" && pathname === href);

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-full bg-zinc-950 border-r border-zinc-800 transition-all duration-300 ease-in-out shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header */}
      <div className={cn(
        "border-b border-zinc-800 flex items-center shrink-0 h-16",
        collapsed ? "justify-center px-2" : "px-5 justify-between"
      )}>
        {!collapsed && (
          <span className="text-xl font-bold text-white">
            <span className="text-green-400">Palpita</span>Aí
          </span>
        )}
        {collapsed && <span className="text-2xl">⚽</span>}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            aria-label="Recolher menu"
          >
            <ChevronLeftIcon />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="Expandir menu"
        >
          <ChevronRightIcon />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto">
        {links.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              collapsed ? "justify-center px-0" : "",
              isActive(href)
                ? "bg-green-500/10 text-green-400"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            )}
          >
            <span className="text-base shrink-0">{icon}</span>
            {!collapsed && <span className="whitespace-nowrap">{label}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-zinc-800 shrink-0">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Sair" : undefined}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors",
            collapsed ? "justify-center px-0" : ""
          )}
        >
          <span className="text-base shrink-0">🚪</span>
          {!collapsed && <span className="whitespace-nowrap">Sair</span>}
        </button>
      </div>
    </aside>
  );
}
