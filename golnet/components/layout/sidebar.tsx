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

// 4 items pinned to bottom nav; rest go in "Mais" drawer
const bottomNav = [
  { href: "/dashboard", label: "Início", icon: "🏠" },
  { href: "/predictions", label: "Palpites", icon: "⚽" },
  { href: "/leagues", label: "Ligas", icon: "🏆" },
  { href: "/rankings", label: "Ranking", icon: "📊" },
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
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const allLinks = isAdmin ? [...nav, { href: "/admin", label: "Admin", icon: "⚙️" }] : nav;
  const moreLinks = allLinks.filter((l) => !bottomNav.some((b) => b.href === l.href));

  const isActive = (href: string) =>
    (href !== "/dashboard" && pathname.startsWith(href)) ||
    (href === "/dashboard" && pathname === href);

  return (
    <>
      {/* ── MOBILE: bottom navigation bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950 border-t border-zinc-800 flex items-stretch h-16 safe-area-inset-bottom">
        {bottomNav.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
              isActive(href) ? "text-green-400" : "text-zinc-500 hover:text-white"
            )}
          >
            <span className="text-xl leading-none">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}

        {/* "Mais" button */}
        <button
          onClick={() => setMobileDrawer(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
            mobileDrawer ? "text-green-400" : "text-zinc-500 hover:text-white"
          )}
        >
          <span className="text-xl leading-none">☰</span>
          <span>Mais</span>
        </button>
      </div>

      {/* ── MOBILE: "Mais" slide-up drawer ── */}
      {mobileDrawer && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileDrawer(false)}
          />
          <div className="lg:hidden fixed bottom-16 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-700 rounded-t-2xl p-4 pb-6">
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-3 gap-2">
              {moreLinks.map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileDrawer(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors",
                    isActive(href)
                      ? "bg-green-500/10 text-green-400"
                      : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  )}
                >
                  <span className="text-2xl leading-none">{icon}</span>
                  <span className="text-center leading-tight">{label}</span>
                </Link>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <button
                onClick={() => { setMobileDrawer(false); signOut({ callbackUrl: "/login" }); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
              >
                <span>🚪</span> Sair
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── DESKTOP: collapsible sidebar ── */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-screen bg-zinc-950 border-r border-zinc-800 transition-all duration-300 ease-in-out shrink-0",
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
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0",
              collapsed && "hidden"
            )}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <ChevronLeftIcon />
          </button>
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
          {allLinks.map(({ href, label, icon }) => (
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
    </>
  );
}
