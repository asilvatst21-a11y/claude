import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { token, password } = await req.json();

  if (!token || !password || password.length < 8) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record || record.expiresAt < new Date()) {
      return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { email: record.email },
      data: { password: hashed },
    });

    await prisma.passwordResetToken.delete({ where: { token } });
  } catch (err) {
    console.error("[reset-password]", err);
    return NextResponse.json({ error: "Erro ao redefinir senha. Tente novamente." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
