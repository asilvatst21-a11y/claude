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

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="5" x2="17" y2="5" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="15" x2="17" y2="15" />
    </svg>
  );
}

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const links = isAdmin ? [...nav, { href: "/admin", label: "Admin", icon: "⚙️" }] : nav;

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-zinc-950 border-b border-zinc-800 flex items-center px-4 gap-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-zinc-400 hover:text-white transition-colors p-1"
          aria-label="Abrir menu"
        >
          <HamburgerIcon />
        </button>
        <span className="text-xl font-bold text-white">
          <span className="text-green-400">Palpita</span>Aí
        </span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar / Drawer */}
      <aside
        className={cn(
          "fixed lg:relative inset-y-0 left-0 z-50 h-screen bg-zinc-950 border-r border-zinc-800 flex flex-col transition-all duration-300 ease-in-out",
          // mobile: slide in/out, always w-60
          mobileOpen ? "translate-x-0 w-60" : "-translate-x-full w-60",
          // desktop: always visible, width depends on collapsed state
          collapsed ? "lg:translate-x-0 lg:w-16" : "lg:translate-x-0 lg:w-60"
        )}
      >
        {/* Header */}
        <div className={cn(
          "border-b border-zinc-800 flex items-center shrink-0",
          collapsed ? "lg:justify-center lg:p-4 p-6 justify-between" : "p-6 justify-between"
        )}>
          {!collapsed && (
            <span className="text-2xl font-bold text-white lg:block">
              <span className="text-green-400">Palpita</span>Aí
            </span>
          )}
          {collapsed && (
            <span className="hidden lg:block text-2xl">⚽</span>
          )}
          {/* Mobile close button */}
          {!collapsed && (
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-zinc-400 hover:text-white transition-colors text-xl leading-none"
              aria-label="Fechar menu"
            >
              ✕
            </button>
          )}
          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0",
              collapsed && "mx-auto"
            )}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto">
          {links.map(({ href, label, icon }) => {
            const active =
              (pathname.startsWith(href) && href !== "/dashboard") ||
              (pathname === href && href === "/dashboard");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  collapsed ? "lg:justify-center lg:px-0" : "",
                  active
                    ? "bg-green-500/10 text-green-400"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                )}
              >
                <span className="text-base shrink-0">{icon}</span>
                <span className={cn("transition-all duration-200 whitespace-nowrap overflow-hidden", collapsed ? "lg:hidden" : "")}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-zinc-800 shrink-0">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={collapsed ? "Sair" : undefined}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors",
              collapsed ? "lg:justify-center lg:px-0" : ""
            )}
          >
            <span className="text-base shrink-0">🚪</span>
            <span className={cn("whitespace-nowrap overflow-hidden", collapsed ? "lg:hidden" : "")}>
              Sair
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
