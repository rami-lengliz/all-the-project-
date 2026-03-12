-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "LedgerEntryType" AS ENUM ('RENT_PAID', 'COMMISSION', 'HOST_PAYOUT_DUE', 'REFUND', 'ADJUSTMENT', 'HOST_PAYOUT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "LedgerStatus" AS ENUM ('POSTED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "ledger_entries" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "actorId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TND',
    "status" "LedgerStatus" NOT NULL DEFAULT 'POSTED',
    "reversedEntryId" TEXT UNIQUE,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "ledger_entries_bookingId_idx" ON "ledger_entries"("bookingId");
CREATE INDEX IF NOT EXISTS "ledger_entries_paymentIntentId_idx" ON "ledger_entries"("paymentIntentId");
CREATE INDEX IF NOT EXISTS "ledger_entries_type_idx" ON "ledger_entries"("type");
CREATE INDEX IF NOT EXISTS "ledger_entries_createdAt_idx" ON "ledger_entries"("createdAt");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_paymentIntentId_fkey"
    FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversedEntryId_fkey"
    FOREIGN KEY ("reversedEntryId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NOTE: payout_items.ledgerEntryId FK is deferred to payouts_dispute_v1 where payout_items is created.
