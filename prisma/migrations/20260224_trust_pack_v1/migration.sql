-- CreateEnum: ListingStatus
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED');

-- Add status column to listings (default PENDING_REVIEW for new, but set existing to ACTIVE)
ALTER TABLE "listings" ADD COLUMN "status" "ListingStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

-- Set all existing listings to ACTIVE so they remain visible
UPDATE "listings" SET "status" = 'ACTIVE' WHERE "deletedAt" IS NULL;

-- Create index on status
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- Add booking snapshot columns
ALTER TABLE "bookings" ADD COLUMN "snapshotTitle" VARCHAR(255);
ALTER TABLE "bookings" ADD COLUMN "snapshotPricePerDay" DECIMAL(10, 2);
ALTER TABLE "bookings" ADD COLUMN "snapshotCommissionRate" DECIMAL(5, 4);
ALTER TABLE "bookings" ADD COLUMN "snapshotCurrency" VARCHAR(3) DEFAULT 'TND';
