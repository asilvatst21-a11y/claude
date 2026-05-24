import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1).max(50).optional(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Apenas letras, números e _").optional(),
  state: z.string().min(1).max(2).optional(),
  city: z.string().min(1).max(100).optional(),
  bio: z.string().max(200).optional(),
  profilePublic: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.username) {
    const taken = await prisma.user.findFirst({
      where: { username: parsed.data.username, NOT: { id: session.user.id } },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ error: "Este @username já está em uso" }, { status: 409 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: { id: true, name: true, username: true, state: true, city: true, bio: true, profilePublic: true },
  });

  return NextResponse.json(user);
}
