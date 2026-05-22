import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  const session = await auth();
  if (!session || !isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const logs = await prisma.cronLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(logs);
}
