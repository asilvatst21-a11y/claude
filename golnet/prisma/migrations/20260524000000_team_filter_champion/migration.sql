-- Add team filter and champion prediction fields to League
ALTER TABLE "League" ADD COLUMN "teamFilter" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "League" ADD COLUMN "championPredictionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "League" ADD COLUMN "championPredictionPoints" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "League" ADD COLUMN "actualChampion" TEXT;

-- Create ChampionPrediction table
CREATE TABLE "ChampionPrediction" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "leagueId"  TEXT NOT NULL,
    "team"      TEXT NOT NULL,
    "points"    INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChampionPrediction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChampionPrediction_userId_leagueId_key" ON "ChampionPrediction"("userId", "leagueId");

ALTER TABLE "ChampionPrediction" ADD CONSTRAINT "ChampionPrediction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChampionPrediction" ADD CONSTRAINT "ChampionPrediction_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
