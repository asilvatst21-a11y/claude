CREATE TABLE IF NOT EXISTS "RoundSummary" (
  "id"        TEXT NOT NULL,
  "leagueId"  TEXT NOT NULL,
  "round"     TEXT NOT NULL,
  "text"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoundSummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RoundSummary_leagueId_round_key"
  ON "RoundSummary"("leagueId", "round");
