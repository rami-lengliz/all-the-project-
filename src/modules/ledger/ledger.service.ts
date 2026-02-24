import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LedgerEntryType, LedgerDirection, LedgerStatus, Prisma } from '@prisma/client';

/** Shape returned by postCapture / postRefund */
export interface LedgerPostResult {
    entries: { id: string; type: LedgerEntryType; direction: LedgerDirection; amount: string }[];
    idempotent: boolean;
}

@Injectable()
export class LedgerService {
    private readonly logger = new Logger(LedgerService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ---------------------------------------------------------------------------
    // postCapture
    // On capture: RENT_PAID (CREDIT total), COMMISSION (DEBIT total*rate), HOST_PAYOUT_DUE (CREDIT total*(1-rate))
    // Idempotent: if RENT_PAID for bookingId+paymentIntentId already POSTED → return existing.
    // ---------------------------------------------------------------------------
    async postCapture(
        paymentIntentId: string,
        bookingId: string,
        totalAmount: number | string,
        commissionRate: number | string,
        tx?: Prisma.TransactionClient,
    ): Promise<LedgerPostResult> {
        const db = tx ?? this.prisma;
        const total = Number(totalAmount);
        const rate = Number(commissionRate);
        const commission = +(total * rate).toFixed(2);
        const hostNet = +(total - commission).toFixed(2);

        // Idempotency check — look for existing RENT_PAID entry for same PI+Booking
        const existing = await db.ledgerEntry.findFirst({
            where: {
                paymentIntentId,
                bookingId,
                type: LedgerEntryType.RENT_PAID,
                status: LedgerStatus.POSTED,
            },
        });

        if (existing) {
            this.logger.log(`postCapture: already posted for paymentIntentId=${paymentIntentId}, skipping.`);
            const allExisting = await db.ledgerEntry.findMany({
                where: { paymentIntentId, bookingId },
                orderBy: { createdAt: 'asc' },
            });
            return {
                entries: allExisting.map((e) => ({ id: e.id, type: e.type, direction: e.direction, amount: e.amount.toString() })),
                idempotent: true,
            };
        }

        const meta = { commissionRate: rate, calcVersion: 'v1' };

        const rentEntry = await db.ledgerEntry.create({
            data: {
                bookingId,
                paymentIntentId,
                type: LedgerEntryType.RENT_PAID,
                direction: LedgerDirection.CREDIT,
                amount: total,
                status: LedgerStatus.POSTED,
                metadata: meta,
            },
        });

        const commissionEntry = await db.ledgerEntry.create({
            data: {
                bookingId,
                paymentIntentId,
                type: LedgerEntryType.COMMISSION,
                direction: LedgerDirection.DEBIT,
                amount: commission,
                status: LedgerStatus.POSTED,
                metadata: meta,
            },
        });

        const hostEntry = await db.ledgerEntry.create({
            data: {
                bookingId,
                paymentIntentId,
                type: LedgerEntryType.HOST_PAYOUT_DUE,
                direction: LedgerDirection.CREDIT,
                amount: hostNet,
                status: LedgerStatus.POSTED,
                metadata: meta,
            },
        });

        this.logger.log(
            `postCapture: booked 3 entries for booking=${bookingId} total=${total} commission=${commission} hostNet=${hostNet}`,
        );

        return {
            entries: [rentEntry, commissionEntry, hostEntry].map((e) => ({
                id: e.id,
                type: e.type,
                direction: e.direction,
                amount: e.amount.toString(),
            })),
            idempotent: false,
        };
    }

    // ---------------------------------------------------------------------------
    // postRefund
    // Finds original POSTED entries (RENT_PAID, COMMISSION, HOST_PAYOUT_DUE) for this PI+Booking.
    // Idempotent: if originals already REVERSED OR reversal entries already exist → skip.
    // For each original: creates a REFUND reversal entry (opposite direction), marks original REVERSED.
    // ---------------------------------------------------------------------------
    async postRefund(
        paymentIntentId: string,
        bookingId: string,
        tx?: Prisma.TransactionClient,
    ): Promise<LedgerPostResult> {
        const db = tx ?? this.prisma;

        const captureTypes: LedgerEntryType[] = [
            LedgerEntryType.RENT_PAID,
            LedgerEntryType.COMMISSION,
            LedgerEntryType.HOST_PAYOUT_DUE,
        ];

        // Find original entries for this capture
        const originals = await db.ledgerEntry.findMany({
            where: {
                paymentIntentId,
                bookingId,
                type: { in: captureTypes },
            },
        });

        if (originals.length === 0) {
            this.logger.warn(`postRefund: no capture entries found for paymentIntentId=${paymentIntentId}`);
            return { entries: [], idempotent: true };
        }

        // Idempotency check: already reversed?
        const alreadyReversed = originals.every((e) => e.status === LedgerStatus.REVERSED);
        if (alreadyReversed) {
            this.logger.log(`postRefund: already reversed for paymentIntentId=${paymentIntentId}, skipping.`);
            const refundEntries = await db.ledgerEntry.findMany({
                where: { paymentIntentId, bookingId, type: LedgerEntryType.REFUND },
            });
            return {
                entries: refundEntries.map((e) => ({ id: e.id, type: e.type, direction: e.direction, amount: e.amount.toString() })),
                idempotent: true,
            };
        }

        const reversalEntries: typeof originals = [];

        for (const orig of originals) {
            if (orig.status === LedgerStatus.REVERSED) continue; // skip already reversed

            // Create reversal entry (opposite direction, type=REFUND)
            const reversal = await db.ledgerEntry.create({
                data: {
                    bookingId,
                    paymentIntentId,
                    type: LedgerEntryType.REFUND,
                    direction: orig.direction === LedgerDirection.CREDIT ? LedgerDirection.DEBIT : LedgerDirection.CREDIT,
                    amount: orig.amount,
                    status: LedgerStatus.POSTED,
                    metadata: { reason: 'refund', reversesType: orig.type, calcVersion: 'v1' },
                },
            });
            reversalEntries.push(reversal);

            // Mark original REVERSED and link to its reversal entry
            await db.ledgerEntry.update({
                where: { id: orig.id },
                data: {
                    status: LedgerStatus.REVERSED,
                    reversedEntryId: reversal.id,
                },
            });
        }

        this.logger.log(
            `postRefund: reversed ${originals.length} entries for booking=${bookingId}`,
        );

        return {
            entries: reversalEntries.map((e) => ({ id: e.id, type: e.type, direction: e.direction, amount: e.amount.toString() })),
            idempotent: false,
        };
    }

    // ---------------------------------------------------------------------------
    // getBookingLedger
    // ---------------------------------------------------------------------------
    async getBookingLedger(bookingId: string) {
        return this.prisma.ledgerEntry.findMany({
            where: { bookingId },
            orderBy: { createdAt: 'asc' },
        });
    }

    // ---------------------------------------------------------------------------
    // getHostBalance
    // Net = SUM of HOST_PAYOUT_DUE CREDIT (POSTED) - SUM of HOST_PAYOUT_DUE DEBIT (POSTED, i.e. from refund reversals)
    // ---------------------------------------------------------------------------
    async getHostBalance(hostId: string) {
        // Collect all bookings for the host
        const bookings = await this.prisma.booking.findMany({
            where: { hostId },
            select: { id: true },
        });
        const bookingIds = bookings.map((b) => b.id);

        if (bookingIds.length === 0) {
            return { balance: '0.00', currency: 'TND', lastEntries: [] };
        }

        // HOST_PAYOUT_DUE entries (CREDIT = earn, DEBIT = reversed by refund)
        const payoutDueEntries = await this.prisma.ledgerEntry.findMany({
            where: {
                bookingId: { in: bookingIds },
                type: LedgerEntryType.HOST_PAYOUT_DUE,
                status: LedgerStatus.POSTED,
            },
        });

        // HOST_PAYOUT entries (DEBIT = money paid out to host — decreases owed balance)
        // These use the host's bookingId as the reference booking
        const payoutEntries = await this.prisma.ledgerEntry.findMany({
            where: {
                bookingId: { in: bookingIds },
                type: LedgerEntryType.HOST_PAYOUT,
                status: LedgerStatus.POSTED,
            },
        });

        let balance = 0;
        for (const e of payoutDueEntries) {
            const v = Number(e.amount);
            if (e.direction === LedgerDirection.CREDIT) balance += v;
            else balance -= v;
        }
        for (const e of payoutEntries) {
            // HOST_PAYOUT DEBIT decreases what we owe the host
            const v = Number(e.amount);
            if (e.direction === LedgerDirection.DEBIT) balance -= v;
            else balance += v;
        }

        const lastEntries = await this.prisma.ledgerEntry.findMany({
            where: { bookingId: { in: bookingIds } },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        return {
            balance: balance.toFixed(2),
            currency: 'TND',
            lastEntries,
        };
    }

    // ---------------------------------------------------------------------------
    // getLedgerSummary (for admin)
    // ---------------------------------------------------------------------------
    async getLedgerSummary(from?: string, to?: string) {
        const where: Prisma.LedgerEntryWhereInput = {
            status: LedgerStatus.POSTED,
        };
        if (from || to) {
            where.createdAt = {};
            if (from) (where.createdAt as any).gte = new Date(from);
            if (to) (where.createdAt as any).lte = new Date(to);
        }

        const entries = await this.prisma.ledgerEntry.findMany({ where });

        const sumByType = (type: LedgerEntryType) =>
            entries
                .filter((e) => e.type === type)
                .reduce((acc, e) => acc + Number(e.amount), 0)
                .toFixed(2);

        const refundEntries = entries.filter((e) => e.type === LedgerEntryType.REFUND);

        return {
            gross: sumByType(LedgerEntryType.RENT_PAID),
            commission: sumByType(LedgerEntryType.COMMISSION),
            hostNet: sumByType(LedgerEntryType.HOST_PAYOUT_DUE),
            refunds: sumByType(LedgerEntryType.REFUND),
            refundCount: refundEntries.length,
            currency: 'TND',
            entryCount: entries.length,
        };
    }
}
