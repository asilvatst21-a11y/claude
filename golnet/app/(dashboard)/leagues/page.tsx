import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LeaguesClient } from "./leagues-client";

export const metadata = { title: "Ligas — PalpitaAí" };

export default async function LeaguesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const isPro = ["PRO", "ENTERPRISE"].includes(user?.plan ?? "FREE");

  return <LeaguesClient isPro={isPro} />;
}
