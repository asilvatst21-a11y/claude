import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = params;

  const user = await prisma.user.update({
    where: { id },
    data: { plan: parsed.data.plan },
    select: { id: true, name: true, email: true, plan: true },
  });

  return NextResponse.json(user);
}
