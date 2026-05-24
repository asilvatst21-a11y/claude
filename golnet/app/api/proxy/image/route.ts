import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SAFE_CONTENT_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif",
]);

function isAllowed(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") return false;
    return (
      hostname.endsWith(".api-sports.io") ||
      hostname === "api-sports.io" ||
      hostname.endsWith(".api-football.com") ||
      hostname === "api-football.com"
    );
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url || !isAllowed(url)) {
    return new NextResponse(null, { status: 400 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY ?? "";

  try {
    const res = await fetch(url, {
      headers: apiKey ? { "x-apisports-key": apiKey } : {},
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!SAFE_CONTENT_TYPES.has(contentType)) {
      return new NextResponse(null, { status: 415 });
    }

    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
