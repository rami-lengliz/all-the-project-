-- CreateEnum: PayoutStatus
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum: DisputeStatus
CREATE TYPE "DisputeStatus" AS ENUM ('NONE', 'OPEN', 'RESOLVED');

-- Add HOST_PAYOUT to LedgerEntryType enum
ALTER TYPE "LedgerEntryType" ADD VALUE 'HOST_PAYOUT';

-- Add disputeStatus column to bookings
ALTER TABLE "bookings" ADD COLUMN "disputeStatus" "DisputeStatus" NOT NULL DEFAULT 'NONE';

-- CreateTable: payouts
CREATE TABLE "payouts" (
    "id"        TEXT NOT NULL,
    "hostId"    TEXT NOT NULL,
    "amount"    DECIMAL(10,2) NOT NULL,
    "currency"  VARCHAR(3) NOT NULL DEFAULT 'TND',
    "status"    "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "method"    VARCHAR(100),
    "reference" VARCHAR(255),
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt"    TIMESTAMP(3),
    "adminId"   TEXT,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: payouts
CREATE INDEX "payouts_hostId_idx"    ON "payouts"("hostId");
CREATE INDEX "payouts_status_idx"    ON "payouts"("status");
CREATE INDEX "payouts_createdAt_idx" ON "payouts"("createdAt");

-- FK: payouts.hostId -> users.id
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: payout_items
CREATE TABLE "payout_items" (
    "id"            TEXT NOT NULL,
    "payoutId"      TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: payout_items
CREATE UNIQUE INDEX "payout_items_ledgerEntryId_key" ON "payout_items"("ledgerEntryId");
CREATE INDEX "payout_items_payoutId_idx" ON "payout_items"("payoutId");

-- FKs: payout_items
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_ledgerEntryId_fkey"
    FOREIGN KEY ("ledgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
