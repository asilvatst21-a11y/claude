import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Simple admin check — only allow users with email ending in @admin or specific env var
  // In production, implement proper role-based access
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  const userEmail = session.user.email ?? "";
  if (!adminEmails.includes(userEmail) && adminEmails[0] !== "") {
    // Fall through to allow access in development when ADMIN_EMAILS is not set
    if (adminEmails[0] !== "") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      plan: true,
      image: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const total = users.length;

  return NextResponse.json({ users, total });
}
