import { NextResponse } from "next/server";

export async function GET() {
  const API_KEY = process.env.API_FOOTBALL_KEY ?? "";

  const res = await fetch("https://v3.football.api-sports.io/fixtures?league=71&season=2026", {
    headers: { "x-apisports-key": API_KEY },
    cache: "no-store",
  });

  const text = await res.text();

  return NextResponse.json({
    status: res.status,
    ok: res.ok,
    apiKeyPresent: !!API_KEY,
    apiKeyPrefix: API_KEY.slice(0, 6),
    body: text.slice(0, 500),
  });
}
