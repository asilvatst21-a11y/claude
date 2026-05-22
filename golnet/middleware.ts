import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Fallback in-memory limiter when Upstash is not configured
const memMap = new Map<string, { count: number; resetAt: number }>();
function memLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memMap.get(key);
  if (!entry || now > entry.resetAt) {
    memMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// Upstash limiters — created lazily so build doesn't fail without env vars
let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function getLimiter(route: string, limit: number, windowSec: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!limiters.has(route)) {
    limiters.set(
      route,
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
        prefix: `rl:${route}`,
        analytics: false,
      })
    );
  }
  return limiters.get(route)!;
}

// [maxRequests, windowSeconds]
const LIMITS: Record<string, [number, number]> = {
  "/api/auth/register":        [5,  60],
  "/api/auth/forgot-password": [5,  60],
  "/api/auth/reset-password":  [10, 60],
  "/api/predictions":          [60, 60],
  "/api/duels":                [20, 60],
  "/api/push/subscribe":       [10, 60],
};

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const limits = LIMITS[pathname];

  if (limits && req.method !== "GET") {
    const ip = getIP(req);
    const [maxReq, windowSec] = limits;
    const limiter = getLimiter(pathname, maxReq, windowSec);

    let allowed: boolean;

    if (limiter) {
      const { success } = await limiter.limit(ip);
      allowed = success;
    } else {
      // Fallback: in-memory (per serverless instance)
      allowed = memLimit(`${ip}:${pathname}`, maxReq, windowSec * 1000);
    }

    if (!allowed) {
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
