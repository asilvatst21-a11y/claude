"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileSpreadsheet,
  ClipboardList,
  Users,
  Truck,
  History,
  RotateCcw,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/importar",
    label: "Importar Planilha",
    icon: FileSpreadsheet,
  },
  {
    href: "/importacoes",
    label: "Histórico",
    icon: History,
  },
  {
    href: "/vales",
    label: "Vales",
    icon: ClipboardList,
  },
  {
    href: "/ajudantes",
    label: "Ajudantes",
    icon: Users,
  },
  {
    href: "/reposicoes",
    label: "Reposições",
    icon: RotateCcw,
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings,
  },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-r border-border flex flex-col">
      {/* Logo / Header */}
      <div className="h-16 flex items-center px-6 border-b border-border bg-[#00445a]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[#c97d1e]">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-extrabold text-base leading-none tracking-wide text-white">
              LOG<span className="text-[#c97d1e]">20</span>
            </p>
            <p className="text-[10px] leading-none mt-0.5 tracking-widest uppercase text-white/60">
              Logística
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          LOG20 Logística &copy; {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  );
}
