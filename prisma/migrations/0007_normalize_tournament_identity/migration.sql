-- Keep the shared tournament identity and edition labels consistent.
UPDATE "Tournament"
SET
  "name" = 'Torneo di Bocce',
  "edition" = "editionNumber"::text || '° edizione',
  "updatedAt" = CURRENT_TIMESTAMP;
