-- Migration: add_price_suggestion_log
-- Creates the ai_price_suggestion_logs table for PFE evaluation and debugging.
-- Run manually when DB is available:
--   psql $DATABASE_URL < prisma/migrations/20260409000000_add_price_suggestion_log/migration.sql

CREATE TABLE "ai_price_suggestion_logs" (
  "id"              TEXT         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Request scalars
  "city"            VARCHAR(255) NOT NULL,
  "category"        VARCHAR(100) NOT NULL,
  "unit"            VARCHAR(50)  NOT NULL,
  "season"          VARCHAR(50),
  "propertyType"    VARCHAR(50),
  "distanceToSeaKm" DOUBLE PRECISION,
  "capacity"        INTEGER,
  "lat"             DOUBLE PRECISION,
  "lng"             DOUBLE PRECISION,

  -- Output scalars
  "suggestedPrice"  DECIMAL(10,2) NOT NULL,
  "rangeMin"        DECIMAL(10,2) NOT NULL,
  "rangeMax"        DECIMAL(10,2) NOT NULL,
  "confidence"      VARCHAR(10)   NOT NULL,
  "compsUsed"       INTEGER       NOT NULL,
  "wCity"           DOUBLE PRECISION NOT NULL,
  "wNational"       DOUBLE PRECISION NOT NULL,

  -- JSON blobs
  "adjustments"     JSONB,
  "explanation"     JSONB         NOT NULL,

  -- Post-publish link (patched after listing is created)
  "listingId"       TEXT,
  "finalPrice"      DECIMAL(10,2),
  "overridden"      BOOLEAN
);

CREATE INDEX "ai_price_suggestion_logs_createdAt_idx"    ON "ai_price_suggestion_logs" ("createdAt");
CREATE INDEX "ai_price_suggestion_logs_city_category_idx" ON "ai_price_suggestion_logs" ("city", "category");
CREATE INDEX "ai_price_suggestion_logs_listingId_idx"    ON "ai_price_suggestion_logs" ("listingId");
