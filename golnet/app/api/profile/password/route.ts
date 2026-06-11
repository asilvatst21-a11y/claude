import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const changeSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(8, "Nova senha deve ter pelo menos 8 caracteres"),
});

const setSchema = z.object({
  next: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
  confirm: z.string().min(8),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });

  // OAuth account setting password for the first time
  if (!user?.password) {
    const parsed = setSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Dados inválidos";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (parsed.data.next !== parsed.data.confirm) {
      return NextResponse.json({ error: "As senhas não coincidem" }, { status: 400 });
    }
    const hashed = await bcrypt.hash(parsed.data.next, 12);
    await prisma.user.update({ where: { id: session.user.id }, data: { password: hashed } });
    return NextResponse.json({ ok: true });
  }

  // Existing password account — requires current password
  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const valid = await bcrypt.compare(parsed.data.current, user.password);
  if (!valid) return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 });

  const hashed = await bcrypt.hash(parsed.data.next, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { password: hashed } });

  return NextResponse.json({ ok: true });
}
