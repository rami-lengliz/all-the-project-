-- AlterTable: listing-level calendar settings
ALTER TABLE "listings" ADD COLUMN     "min_nights" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "listings" ADD COLUMN     "ical_import_url" VARCHAR(500);

-- AlterTable: track block origin (manual vs imported iCal)
ALTER TABLE "listing_availability_blocks" ADD COLUMN     "source" VARCHAR(16) NOT NULL DEFAULT 'manual';
ALTER TABLE "listing_availability_blocks" ADD COLUMN     "external_uid" VARCHAR(255);

-- CreateIndex
CREATE INDEX "listing_availability_blocks_listing_id_source_idx" ON "listing_availability_blocks"("listing_id", "source");

-- CreateTable: per-date price overrides
CREATE TABLE "listing_date_prices" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_date_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_date_prices_listing_id_date_key" ON "listing_date_prices"("listing_id", "date");

-- CreateIndex
CREATE INDEX "listing_date_prices_listing_id_date_idx" ON "listing_date_prices"("listing_id", "date");

-- AddForeignKey
ALTER TABLE "listing_date_prices" ADD CONSTRAINT "listing_date_prices_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
