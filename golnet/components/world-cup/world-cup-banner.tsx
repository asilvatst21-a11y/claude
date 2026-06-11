"use client";

import { useEffect, useState } from "react";
import { useCopaTheme } from "./copa-theme-provider";
import { TeamSelectorButton } from "./team-selector";

// Copa do Mundo 2026: 11 de junho – 19 de julho
const COPA_START = new Date("2026-06-11T00:00:00");
const COPA_END = new Date("2026-07-20T00:00:00");

export function WorldCupBanner() {
  const [now, setNow] = useState<Date | null>(null);
  const { team } = useCopaTheme();

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
      className="flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold shrink-0"
      style={{
        background: `linear-gradient(90deg, color-mix(in srgb, ${team.bannerBg} 80%, black) 0%, ${team.bannerBg} 50%, color-mix(in srgb, ${team.bannerBg} 80%, black) 100%)`,
        borderBottom: `2px solid ${team.bannerBorder}`,
        color: team.bannerText,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0">🏆</span>
        {isLive ? (
          <span className="truncate">
            Copa do Mundo 2026 está acontecendo agora!{" "}
            <span className="opacity-80 font-normal">Boa sorte nos palpites!</span>
          </span>
        ) : (
          <span className="truncate">
            Copa do Mundo 2026 começa em{" "}
            <strong style={{ color: team.bannerBorder }}>
              {daysUntil} {daysUntil === 1 ? "dia" : "dias"}!
            </strong>{" "}
            <span className="opacity-80 font-normal hidden sm:inline">Prepare seus palpites.</span>
          </span>
        )}
      </div>
      <TeamSelectorButton />
    </div>
  );
}
