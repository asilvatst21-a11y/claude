import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 200_000; // 200 KB limit for base64 data URL

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { image } = body;

  if (!image || typeof image !== "string") {
    return NextResponse.json({ error: "Imagem inválida" }, { status: 400 });
  }

  const ALLOWED_MIME = ["data:image/png;", "data:image/jpeg;", "data:image/webp;", "data:image/gif;"];
  if (!ALLOWED_MIME.some((m) => image.startsWith(m))) {
    return NextResponse.json({ error: "Formato inválido. Use PNG, JPEG, WebP ou GIF." }, { status: 400 });
  }

  if (Buffer.byteLength(image, "utf8") > MAX_BYTES) {
    return NextResponse.json({ error: "Imagem muito grande (máx 150KB)" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image },
  });

  return NextResponse.json({ ok: true, image });
}
