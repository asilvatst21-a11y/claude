import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { PushPermission } from "@/components/push-permission";
import { WorldCupBanner } from "@/components/world-cup/world-cup-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const admin = isAdmin(session.user?.email);

  const pendingDuels = session.user?.id
    ? await prisma.duel.count({ where: { opponentId: session.user.id, status: "PENDING" } })
    : 0;

  return (
    <div className="flex flex-col h-screen">
      <WorldCupBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar isAdmin={admin} pendingDuels={pendingDuels} />
        <main className="flex-1 min-h-0 overflow-y-auto bg-zinc-950 p-6 pb-24 lg:pb-6">
          {children}
        </main>
        <MobileNav isAdmin={admin} pendingDuels={pendingDuels} />
      </div>
      <PushPermission />
    </div>
  );
}
