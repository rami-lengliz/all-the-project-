-- AlterEnum
ALTER TYPE "BookingType" ADD VALUE IF NOT EXISTS 'SLOT';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "startTime" TIME,
ADD COLUMN IF NOT EXISTS "endTime" TIME;

-- CreateTable
CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "renterId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "bookingId" TEXT,
    "listingId" TEXT,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "slot_configurations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingId" TEXT NOT NULL,
    "slotDurationMinutes" INTEGER NOT NULL,
    "operatingHours" JSONB NOT NULL,
    "minBookingSlots" INTEGER NOT NULL DEFAULT 1,
    "maxBookingSlots" INTEGER,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "pricePerSlot" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "slot_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_renterId_hostId_bookingId_key" ON "conversations"("renterId", "hostId", "bookingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_renterId_idx" ON "conversations"("renterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_hostId_idx" ON "conversations"("hostId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_bookingId_idx" ON "conversations"("bookingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_listingId_idx" ON "conversations"("listingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_conversationId_idx" ON "messages"("conversationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_createdAt_idx" ON "messages"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "slot_configurations_listingId_key" ON "slot_configurations"("listingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "slot_configurations_listingId_idx" ON "slot_configurations"("listingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookings_listingId_startDate_startTime_endTime_idx" ON "bookings"("listingId", "startDate", "startTime", "endTime");

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "slot_configurations" ADD CONSTRAINT "slot_configurations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
