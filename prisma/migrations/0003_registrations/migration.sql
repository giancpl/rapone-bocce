CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "Registration" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "playerOne" TEXT NOT NULL,
  "playerTwo" TEXT NOT NULL,
  "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Registration_tournamentId_status_createdAt_idx" ON "Registration"("tournamentId", "status", "createdAt");
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
