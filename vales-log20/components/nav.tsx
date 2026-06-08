"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileSpreadsheet,
  ClipboardList,
  Users,
  History,
  RotateCcw,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vales", label: "Vales", icon: ClipboardList },
  { href: "/ajudantes", label: "Ajudantes", icon: Users },
  { href: "/importar", label: "Importar", icon: FileSpreadsheet },
  { href: "/importacoes", label: "Histórico", icon: History },
  { href: "/reposicoes", label: "Reposições", icon: RotateCcw },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="h-14 shrink-0 border-b bg-white flex items-center px-4 gap-6 z-10 shadow-sm">
      {/* Logo */}
      <Link href="/" className="shrink-0 flex items-center">
        <Image
          src="/logo (1).png"
          alt="LOG20 Logística"
          width={120}
          height={36}
          className="h-8 w-auto object-contain"
          priority
        />
      </Link>

      <div className="w-px h-6 bg-border shrink-0" />

      {/* Nav links */}
      <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-[#00445a] text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <ThemeToggle />

      {/* Brand tag */}
      <span className="shrink-0 text-xs text-muted-foreground hidden md:block">
        LOG20 Logística
      </span>
    </header>
  );
}
