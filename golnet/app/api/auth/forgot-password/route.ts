import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: Request) {
  const body = await req.json();
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  console.log("[forgot-password] user found:", !!user, "has password:", !!user?.password);

  // Always return success to avoid email enumeration
  if (!user || !user.password) {
    console.log("[forgot-password] skipping — no user or no password (OAuth account?)");
    return NextResponse.json({ ok: true });
  }

  try {
    await prisma.passwordResetToken.deleteMany({ where: { email } });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({ data: { email, token, expiresAt } });
    await sendPasswordResetEmail(email, token);
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json({ error: "Erro ao enviar email. Tente novamente." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
