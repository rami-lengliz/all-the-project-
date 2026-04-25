-- Migration: fix_price_suggestion_log_column_mismatch
-- Aligns ai_price_suggestion_logs with current Prisma model mappings.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "category" TO "category_slug";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'propertyType'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "propertyType" TO "property_type";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'distanceToSeaKm'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "distanceToSeaKm" TO "distance_to_sea_km";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'suggestedPrice'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "suggestedPrice" TO "suggested_price";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'rangeMin'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "rangeMin" TO "range_min";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'rangeMax'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "rangeMax" TO "range_max";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'compsUsed'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "compsUsed" TO "comps_city";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'wCity'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "wCity" TO "w_city";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'wNational'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "wNational" TO "w_national";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'listingId'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "listingId" TO "listing_id";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_price_suggestion_logs'
      AND column_name = 'finalPrice'
  ) THEN
    ALTER TABLE "ai_price_suggestion_logs" RENAME COLUMN "finalPrice" TO "final_price";
  END IF;
END $$;

ALTER TABLE "ai_price_suggestion_logs"
  ADD COLUMN IF NOT EXISTS "input_json" JSONB,
  ADD COLUMN IF NOT EXISTS "output_json" JSONB,
  ADD COLUMN IF NOT EXISTS "comps_national" INTEGER,
  ADD COLUMN IF NOT EXISTS "comps_city" INTEGER;

UPDATE "ai_price_suggestion_logs"
SET
  "input_json" = COALESCE("input_json", '{}'::jsonb),
  "output_json" = COALESCE("output_json", '{}'::jsonb),
  "comps_city" = COALESCE("comps_city", 0),
  "comps_national" = COALESCE("comps_national", 0);

ALTER TABLE "ai_price_suggestion_logs"
  ALTER COLUMN "input_json" SET NOT NULL,
  ALTER COLUMN "output_json" SET NOT NULL,
  ALTER COLUMN "comps_city" SET NOT NULL,
  ALTER COLUMN "comps_national" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ai_price_suggestion_logs_city_idx"
  ON "ai_price_suggestion_logs" ("city");

CREATE INDEX IF NOT EXISTS "ai_price_suggestion_logs_category_slug_idx"
  ON "ai_price_suggestion_logs" ("category_slug");

CREATE INDEX IF NOT EXISTS "ai_price_suggestion_logs_listing_id_idx"
  ON "ai_price_suggestion_logs" ("listing_id");
