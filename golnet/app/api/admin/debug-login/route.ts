import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") ?? "asilvatst21@gmail.com";
  const password = searchParams.get("password") ?? "Be030418";

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return NextResponse.json({ error: "Usuário não encontrado" });
    if (!user.password) return NextResponse.json({ error: "Sem senha cadastrada" });

    const match = await bcrypt.compare(password, user.password);

    return NextResponse.json({
      found: true,
      hasPassword: !!user.password,
      passwordHash: user.password.slice(0, 20) + "...",
      match,
      emailVerified: user.emailVerified,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
