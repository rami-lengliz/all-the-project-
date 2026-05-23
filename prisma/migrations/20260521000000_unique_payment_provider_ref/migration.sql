-- Migration: unique_payment_provider_ref
--
-- Makes provider_ref unique so the Konnect webhook can look up a PaymentIntent
-- by providerRef with a hard DB-level guarantee (one payment_ref → one intent).
-- NULL values are excluded from the unique constraint by Postgres semantics,
-- so simulated and legacy intents (provider_ref IS NULL) are unaffected.
--
-- Safety guard: abort if any duplicate non-null provider_ref already exists.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT provider_ref
    FROM payment_intents
    WHERE provider_ref IS NOT NULL
    GROUP BY provider_ref
    HAVING COUNT(*) > 1
  ) dupes;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Migration aborted: % duplicate provider_ref value(s) found in payment_intents. '
      'Resolve duplicates manually before applying this migration.',
      dup_count;
  END IF;
END;
$$;

-- Drop the plain index — the unique constraint below creates an equivalent index.
DROP INDEX IF EXISTS "payment_intents_provider_ref_idx";

-- Add the unique constraint (Postgres creates a unique index automatically).
ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_provider_ref_key" UNIQUE ("provider_ref");
