CREATE TABLE IF NOT EXISTS "ChampionshipSummary" (
  "id"        TEXT NOT NULL,
  "leagueId"  TEXT NOT NULL,
  "text"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChampionshipSummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChampionshipSummary_leagueId_key"
  ON "ChampionshipSummary"("leagueId");
