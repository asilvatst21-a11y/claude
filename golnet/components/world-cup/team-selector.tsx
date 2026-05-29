"use client";

import { useState } from "react";
import { COPA_TEAMS } from "@/lib/copa-teams";
import { useCopaTheme } from "./copa-theme-provider";

export function TeamSelectorButton() {
  const [open, setOpen] = useState(false);
  const { team } = useCopaTheme();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-black/20 hover:bg-black/30 transition-colors shrink-0"
        style={{ color: team.bannerText }}
        aria-label="Escolher seleção"
      >
        <span>{team.flag}</span>
        <span className="hidden sm:inline">{team.name}</span>
        <span className="opacity-70">▾</span>
      </button>

      {open && <TeamSelectorModal onClose={() => setOpen(false)} />}
    </>
  );
}

function TeamSelectorModal({ onClose }: { onClose: () => void }) {
  const { team: current, setTeam } = useCopaTheme();

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">🏆 Escolha sua seleção</h2>
            <p className="text-zinc-400 text-sm">Personalize o app com as cores do seu time</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors text-xl leading-none p-1"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto p-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
          {COPA_TEAMS.map((t) => {
            const isSelected = t.id === current.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTeam(t); onClose(); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-all border-2"
                style={{
                  backgroundColor: isSelected ? t.accent + "22" : "transparent",
                  borderColor: isSelected ? t.accent : "transparent",
                  color: isSelected ? t.accent : "#a1a1aa",
                }}
              >
                <span className="text-3xl leading-none">{t.flag}</span>
                <span className="text-center leading-tight">{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
