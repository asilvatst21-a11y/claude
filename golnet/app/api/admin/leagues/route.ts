import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchLeagues } from "@/lib/api-football";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  if (!q.trim()) {
    return NextResponse.json([]);
  }

  const results = await searchLeagues(q);
  return NextResponse.json(results);
}
