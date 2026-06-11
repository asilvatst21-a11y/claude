"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useCopaTheme } from "@/components/world-cup/copa-theme-provider";

const bottomNav = [
  { href: "/dashboard", label: "Início", icon: "🏠" },
  { href: "/predictions", label: "Palpites", icon: "⚽" },
  { href: "/leagues", label: "Ligas", icon: "🏆" },
  { href: "/rankings", label: "Ranking", icon: "📊" },
];

const moreNav = [
  { href: "/x1", label: "X1 Duelos", icon: "⚔️" },
  { href: "/standings", label: "Classificação", icon: "🏅" },
  { href: "/profile", label: "Perfil", icon: "👤" },
  { href: "/pricing", label: "Planos", icon: "💎" },
  { href: "/rules", label: "Regras", icon: "📖" },
  { href: "/support", label: "Suporte", icon: "💬" },
];

export function MobileNav({ isAdmin = false, pendingDuels = 0 }: { isAdmin?: boolean; pendingDuels?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { team } = useCopaTheme();

  const allMore = isAdmin
    ? [...moreNav, { href: "/admin", label: "Admin", icon: "⚙️" }]
    : moreNav;

  const isActive = (href: string) =>
    (href !== "/dashboard" && pathname.startsWith(href)) ||
    (href === "/dashboard" && pathname === href);

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-up drawer */}
      {open && (
        <div className="fixed bottom-16 left-0 right-0 z-50 lg:hidden bg-zinc-900 border-t border-zinc-700 rounded-t-2xl p-4 pb-6">
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
          <div className="grid grid-cols-3 gap-2">
            {allMore.map(({ href, label, icon }) => {
              const badge = href === "/x1" && pendingDuels > 0 ? pendingDuels : 0;
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors",
                    !active && "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  )}
                  style={active ? {
                    backgroundColor: team.accent + "1a",
                    color: team.accent,
                  } : undefined}
                >
                  <span className="relative text-2xl leading-none">
                    {icon}
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span className="text-center leading-tight">{label}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <button
              onClick={() => { setOpen(false); signOut({ callbackUrl: "/login" }); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            >
              <span>🚪</span> Sair
            </button>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-zinc-950 border-t border-zinc-800 flex h-16">
        {bottomNav.map(({ href, label, icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                !active && "text-zinc-500"
              )}
              style={active ? { color: team.accent } : undefined}
            >
              <span className="text-xl leading-none">{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
            !open && "text-zinc-500"
          )}
          style={open ? { color: team.accent } : undefined}
        >
          <span className="relative text-xl leading-none">
            ☰
            {pendingDuels > 0 && !open && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full">
                {pendingDuels > 9 ? "9+" : pendingDuels}
              </span>
            )}
          </span>
          <span>Mais</span>
        </button>
      </div>
    </>
  );
}
