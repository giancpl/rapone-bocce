-- Multi-edition archive with a single global organizer.
-- Legacy tournament password/session columns stay in place for a safe rolling deploy.
CREATE TABLE "Organizer" (
  "id" TEXT NOT NULL,
  "adminPasswordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organizer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Tournament"
  ADD COLUMN "editionNumber" INTEGER,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

WITH ranked AS (
  SELECT "id", 50 + ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS edition_number
  FROM "Tournament"
)
UPDATE "Tournament" AS tournament
SET "editionNumber" = ranked.edition_number
FROM ranked
WHERE tournament."id" = ranked."id";

UPDATE "Tournament"
SET "scheduledAt" = TIMESTAMP '2026-08-13 14:00:00'
WHERE "editionNumber" = 51;

UPDATE "Tournament"
SET "isCurrent" = true
WHERE "id" = (
  SELECT "id" FROM "Tournament"
  ORDER BY "createdAt" DESC, "id" DESC
  LIMIT 1
);

ALTER TABLE "Tournament" ALTER COLUMN "editionNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Tournament_editionNumber_key" ON "Tournament"("editionNumber");
CREATE INDEX "Tournament_isCurrent_idx" ON "Tournament"("isCurrent");
CREATE UNIQUE INDEX "Tournament_single_current_idx" ON "Tournament" ((1)) WHERE "isCurrent" = true;

INSERT INTO "Organizer" ("id", "adminPasswordHash")
SELECT 'main', "adminPasswordHash"
FROM "Tournament"
ORDER BY "createdAt" DESC, "id" DESC
LIMIT 1;

ALTER TABLE "Team" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AdminSession" ADD COLUMN "organizerId" TEXT;
UPDATE "AdminSession" SET "organizerId" = 'main';
CREATE INDEX "AdminSession_organizerId_expiresAt_idx" ON "AdminSession"("organizerId", "expiresAt");
ALTER TABLE "AdminSession"
  ADD CONSTRAINT "AdminSession_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
