"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 30_000;

// Pings /api/live-refresh while the app is open so match scores stay fresh even when
// GitHub Actions' scheduled cron is delayed (GitHub does not guarantee schedule precision
// for sub-15-minute intervals — real traffic is a far more reliable trigger).
export function LiveScorePoller() {
  const router = useRouter();

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch("/api/live-refresh", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.synced > 0) router.refresh();
      } catch {
        // offline or transient — next tick retries
      }
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
