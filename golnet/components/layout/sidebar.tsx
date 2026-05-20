"use client";

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
  { href: "/rules", label: "Regras", icon: "📖" },
  { href: "/profile", label: "Perfil", icon: "👤" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="h-screen w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <div className="p-6 border-b border-zinc-800">
        <span className="text-2xl font-bold text-white">
          <span className="text-green-400">Gol</span>Net
        </span>
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1">
        {nav.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith(href) && href !== "/dashboard"
                ? "bg-green-500/10 text-green-400"
                : pathname === href && href === "/dashboard"
                ? "bg-green-500/10 text-green-400"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            )}
          >
            <span>{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
        >
          <span>🚪</span>
          Sair
        </button>
      </div>
    </aside>
  );
}
