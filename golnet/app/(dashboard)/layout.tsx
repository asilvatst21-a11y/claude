import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { isAdmin } from "@/lib/admin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const admin = isAdmin(session.user?.email);

  return (
    <div className="flex h-screen">
      <Sidebar isAdmin={admin} />
      <main className="flex-1 min-h-0 overflow-y-auto bg-zinc-950 p-6 pb-24 lg:pb-6">
        {children}
      </main>
      <MobileNav isAdmin={admin} />
    </div>
  );
}
