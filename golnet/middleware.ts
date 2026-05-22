import { NextResponse, type NextRequest } from "next/server";

// Simple in-memory rate limiter (resets per serverless instance)
// For production at scale, replace with Upstash Redis (@upstash/ratelimit)
const rateMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// Routes and their limits: [maxRequests, windowMs]
const RATE_LIMITS: Record<string, [number, number]> = {
  "/api/auth/register":        [5,  60_000],  // 5 registros por minuto por IP
  "/api/auth/forgot-password": [5,  60_000],  // 5 por minuto
  "/api/auth/reset-password":  [10, 60_000],  // 10 por minuto
  "/api/predictions":          [60, 60_000],  // 60 palpites por minuto
  "/api/duels":                [20, 60_000],  // 20 duelos por minuto
  "/api/push/subscribe":       [10, 60_000],  // 10 por minuto
};

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const limits = RATE_LIMITS[pathname];

  if (limits && req.method !== "GET") {
    const ip = getIP(req);
    const key = `${ip}:${pathname}`;
    const [maxReq, windowMs] = limits;

    if (!rateLimit(key, maxReq, windowMs)) {
      return new NextResponse(
        JSON.stringify({ error: "Muitas requisições. Tente novamente em instantes." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
