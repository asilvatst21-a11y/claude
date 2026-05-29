"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { COPA_TEAMS, DEFAULT_TEAM, type CopaTeam } from "@/lib/copa-teams";

type CopaThemeCtx = {
  team: CopaTeam;
  setTeam: (team: CopaTeam) => void;
};

const CopaThemeContext = createContext<CopaThemeCtx>({
  team: DEFAULT_TEAM,
  setTeam: () => {},
});

export function useCopaTheme() {
  return useContext(CopaThemeContext);
}

export function CopaThemeProvider({ children }: { children: React.ReactNode }) {
  const [team, setTeamState] = useState<CopaTeam>(DEFAULT_TEAM);

  useEffect(() => {
    const saved = localStorage.getItem("copa-team");
    if (saved) {
      const found = COPA_TEAMS.find((t) => t.id === saved);
      if (found) setTeamState(found);
    }
  }, []);

  function setTeam(t: CopaTeam) {
    setTeamState(t);
    localStorage.setItem("copa-team", t.id);
  }

  return (
    <CopaThemeContext.Provider value={{ team, setTeam }}>
      {children}
    </CopaThemeContext.Provider>
  );
}
