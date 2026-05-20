import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdminPanel } from "@/components/admin/admin-panel";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const total = await prisma.match.count();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Painel Administrativo</h1>
      <AdminPanel matchStats={{ total }} />
    </div>
  );
}
