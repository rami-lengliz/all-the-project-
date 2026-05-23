-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('RENTER_TO_HOST', 'HOST_TO_RENTER');

-- Drop the old single-review-per-booking unique constraint
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_bookingId_key";

-- Add the type column (default existing rows to RENTER_TO_HOST)
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "type" "ReviewType" NOT NULL DEFAULT 'RENTER_TO_HOST';

-- Add composite unique: one review per reviewer per booking
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_authorId_key" UNIQUE ("bookingId", "authorId");

-- Add index on listingId for fast listing-reviews lookup
CREATE INDEX IF NOT EXISTS "reviews_listingId_idx" ON "reviews"("listingId");
