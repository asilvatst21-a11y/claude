"use client";

import { useEffect, useState } from "react";

// Copa do Mundo 2026: 11 de junho – 19 de julho
const COPA_START = new Date("2026-06-11T00:00:00");
const COPA_END = new Date("2026-07-20T00:00:00");

export function WorldCupBanner() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now || now >= COPA_END) return null;

  const isLive = now >= COPA_START;
  const daysUntil = Math.ceil((COPA_START.getTime() - now.getTime()) / 86_400_000);

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white shrink-0 select-none"
      style={{
        background: "linear-gradient(90deg, #006622 0%, #009C3B 35%, #009C3B 65%, #006622 100%)",
        borderBottom: "2px solid #FFDF00",
      }}
    >
      🏆{" "}
      {isLive ? (
        <>
          <span>Copa do Mundo 2026 está acontecendo agora!</span>
          <span className="font-bold" style={{ color: "#FFDF00" }}>🇧🇷 Boa sorte nos palpites!</span>
        </>
      ) : (
        <>
          <span>Copa do Mundo 2026 começa em</span>
          <span className="font-bold" style={{ color: "#FFDF00" }}>
            {daysUntil} {daysUntil === 1 ? "dia" : "dias"}!
          </span>
          <span className="opacity-80">🇧🇷 Prepare seus palpites.</span>
        </>
      )}
    </div>
  );
}
