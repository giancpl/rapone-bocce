
CREATE TYPE "TournamentStatus" AS ENUM ('SETUP','READY','LIVE','FINISHED');
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED','LIVE','FINISHED');

CREATE TABLE "Tournament" (
 "id" TEXT NOT NULL, "name" TEXT NOT NULL, "edition" TEXT NOT NULL,
 "status" "TournamentStatus" NOT NULL DEFAULT 'SETUP',
 "adminPasswordHash" TEXT NOT NULL, "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Team" (
 "id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "name" TEXT NOT NULL, "seed" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Match" (
 "id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "round" INTEGER NOT NULL, "position" INTEGER NOT NULL,
 "field" INTEGER, "teamAId" TEXT, "teamBId" TEXT, "scoreA" INTEGER NOT NULL DEFAULT 0, "scoreB" INTEGER NOT NULL DEFAULT 0,
 "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED', "winnerId" TEXT, "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AdminSession" (
 "id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Team_tournamentId_name_key" ON "Team"("tournamentId","name");
CREATE UNIQUE INDEX "Match_tournamentId_round_position_key" ON "Match"("tournamentId","round","position");
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");
CREATE INDEX "Team_tournamentId_idx" ON "Team"("tournamentId");
CREATE INDEX "Match_tournamentId_status_idx" ON "Match"("tournamentId","status");
CREATE INDEX "Match_tournamentId_round_idx" ON "Match"("tournamentId","round");
CREATE INDEX "AdminSession_tournamentId_expiresAt_idx" ON "AdminSession"("tournamentId","expiresAt");
ALTER TABLE "Team" ADD CONSTRAINT "Team_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
