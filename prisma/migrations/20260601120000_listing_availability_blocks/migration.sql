-- CreateTable
CREATE TABLE "listing_availability_blocks" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_availability_blocks_listing_id_start_date_end_date_idx" ON "listing_availability_blocks"("listing_id", "start_date", "end_date");

-- AddForeignKey
ALTER TABLE "listing_availability_blocks" ADD CONSTRAINT "listing_availability_blocks_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
