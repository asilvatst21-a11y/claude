import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshMatchScores } from "@/lib/sync-matches";

export const runtime = "nodejs";
export const maxDuration = 30;

// Lightweight, session-gated endpoint the frontend polls while a user has the app open,
// so live scores stay fresh even when GitHub Actions' scheduled cron is delayed (GitHub
// does not guarantee schedule precision for sub-15-minute intervals). Only refreshes match
// scores — never touches predictions/points — so it's safe to call from many browsers at once.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const result = await refreshMatchScores();
  return NextResponse.json(result);
}
