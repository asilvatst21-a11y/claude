"use client";

import Link from "next/link";

interface PlanGateProps {
  requiredPlan: "PRO" | "ENTERPRISE";
  userPlan: string;
  children: React.ReactNode;
}

const PLAN_ORDER = { FREE: 0, PRO: 1, ENTERPRISE: 2 };

function hasAccess(userPlan: string, requiredPlan: "PRO" | "ENTERPRISE"): boolean {
  const userLevel = PLAN_ORDER[userPlan as keyof typeof PLAN_ORDER] ?? 0;
  const requiredLevel = PLAN_ORDER[requiredPlan];
  return userLevel >= requiredLevel;
}

export function PlanGate({ requiredPlan, userPlan, children }: PlanGateProps) {
  if (hasAccess(userPlan, requiredPlan)) {
    return <>{children}</>;
  }

  const label = requiredPlan === "PRO" ? "Pro" : "Empresarial";

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-30 blur-sm">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 rounded-xl">
        <span className="text-3xl mb-2">🔒</span>
        <p className="text-sm font-medium text-white mb-1">
          Recurso exclusivo do plano {label}
        </p>
        <p className="text-xs text-zinc-400 mb-4">
          Faça upgrade para desbloquear este recurso
        </p>
        <Link
          href="/pricing"
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Fazer upgrade
        </Link>
      </div>
    </div>
  );
}
