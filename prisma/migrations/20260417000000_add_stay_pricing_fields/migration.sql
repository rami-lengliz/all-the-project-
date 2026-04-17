-- Migration: add_stay_pricing_fields
-- Adds PropertyType enum + 4 stay-pricing columns to the listings table.
-- All new columns are nullable or have defaults → backward compatible with existing rows.

-- 1. Create the enum (idempotent guard via DO block)
DO $$ BEGIN
  CREATE TYPE "PropertyType" AS ENUM ('villa', 'house', 'apartment');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add columns to listings
ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "property_type"   "PropertyType" DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "guests_capacity" INTEGER        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "bedrooms"        INTEGER        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "near_beach"      BOOLEAN        NOT NULL DEFAULT FALSE;
