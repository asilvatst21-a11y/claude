CREATE TABLE IF NOT EXISTS "LeagueJoinRequest" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "leagueId"  TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeagueJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeagueJoinRequest_userId_leagueId_key"
  ON "LeagueJoinRequest"("userId", "leagueId");

ALTER TABLE "LeagueJoinRequest"
  ADD CONSTRAINT "LeagueJoinRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeagueJoinRequest"
  ADD CONSTRAINT "LeagueJoinRequest_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
