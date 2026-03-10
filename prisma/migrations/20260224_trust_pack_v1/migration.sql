-- CreateEnum: ListingStatus (idempotent)
DO $$ BEGIN
  CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add status column to listings (idempotent)
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "status" "ListingStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

-- Set all existing listings to ACTIVE so they remain visible
UPDATE "listings" SET "status" = 'ACTIVE' WHERE "deletedAt" IS NULL AND "status" = 'PENDING_REVIEW';

-- Create index on status (idempotent)
CREATE INDEX IF NOT EXISTS "listings_status_idx" ON "listings"("status");

-- Add booking snapshot columns (idempotent)
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "snapshotTitle" VARCHAR(255);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "snapshotPricePerDay" DECIMAL(10, 2);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "snapshotCommissionRate" DECIMAL(5, 4);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "snapshotCurrency" VARCHAR(3) DEFAULT 'TND';
