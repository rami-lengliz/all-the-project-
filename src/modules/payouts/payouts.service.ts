import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import {
    LedgerEntryType,
    LedgerDirection,
    LedgerStatus,
    PayoutStatus,
    DisputeStatus,
} from '@prisma/client';

@Injectable()
export class PayoutsService {
    private readonly logger = new Logger(PayoutsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ledgerService: LedgerService,
    ) { }

    // ----------------------------------------------------------------
    // listPayouts
    // ----------------------------------------------------------------
    async listPayouts(status?: PayoutStatus, page = 1, limit = 50) {
        const where = status ? { status } : {};
        const [payouts, total] = await Promise.all([
            this.prisma.payout.findMany({
                where,
                include: {
                    host: { select: { id: true, name: true, email: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.payout.count({ where }),
        ]);
        return { payouts, total, page, limit };
    }

    // ----------------------------------------------------------------
    // createPayout
    // Selects eligible HOST_PAYOUT_DUE entries FIFO (oldest first):
    //   - status = POSTED
    //   - not reversed
    //   - not already linked in PayoutItem
    //   - booking's disputeStatus ≠ OPEN
    // Creates Payout (PENDING) + PayoutItems.
    // ----------------------------------------------------------------
    async createPayout(
        hostId: string,
        amount: number,
        adminId: string,
        method?: string,
        reference?: string,
        notes?: string,
    ) {
        // 1. Verify host exists
        const host = await this.prisma.user.findUnique({ where: { id: hostId } });
        if (!host) throw new NotFoundException(`Host ${hostId} not found`);

        // 2. Compute available balance
        const { balance } = await this.ledgerService.getHostBalance(hostId);
        const available = Number(balance);

        if (amount > available) {
            throw new BadRequestException(
                `Requested payout amount ${amount} exceeds host available balance ${available.toFixed(2)} TND`,
            );
        }

        // 3. Find eligible HOST_PAYOUT_DUE ledger entries
        //    - POSTED (not REVERSED)
        //    - not already linked to a PayoutItem
        //    - booking has no OPEN dispute
        const eligible = await this.prisma.ledgerEntry.findMany({
            where: {
                type: LedgerEntryType.HOST_PAYOUT_DUE,
                direction: LedgerDirection.CREDIT,
                status: LedgerStatus.POSTED,
                booking: { hostId, disputeStatus: { not: DisputeStatus.OPEN } },
                payoutItem: null, // not already assigned to a payout
            },
            orderBy: { createdAt: 'asc' }, // FIFO
        });

        if (eligible.length === 0) {
            throw new BadRequestException(
                'No eligible ledger entries available for payout (all may be disputed or already paid out)',
            );
        }

        // 4. Pick enough entries to cover the requested amount (FIFO)
        const selections: typeof eligible = [];
        let covered = 0;
        for (const entry of eligible) {
            if (covered >= amount) break;
            selections.push(entry);
            covered += Number(entry.amount);
        }

        if (covered < amount) {
            throw new BadRequestException(
                `Eligible entries only cover ${covered.toFixed(2)} TND, but ${amount} TND was requested. ` +
                `Some entries may be disputed or already paid out.`,
            );
        }

        // 5. Create payout + payout items in one transaction
        const payout = await this.prisma.$transaction(async (tx) => {
            const newPayout = await tx.payout.create({
                data: {
                    hostId,
                    amount,
                    currency: 'TND',
                    status: PayoutStatus.PENDING,
                    method,
                    reference,
                    notes,
                    adminId,
                },
            });

            await tx.payoutItem.createMany({
                data: selections.map((entry) => ({
                    payoutId: newPayout.id,
                    ledgerEntryId: entry.id,
                })),
            });

            return newPayout;
        });

        this.logger.log(
            `createPayout: payout ${payout.id} created for host ${hostId}, amount=${amount}, items=${selections.length}`,
        );

        return {
            payout,
            itemsCount: selections.length,
            coveredAmount: covered.toFixed(2),
        };
    }

    // ----------------------------------------------------------------
    // markPaid
    // Atomically:
    //   1. Set payout.status = PAID, paidAt = now, store method/reference
    //   2. Post HOST_PAYOUT DEBIT ledger entry for the payout amount
    // Idempotent: if already PAID, return as-is.
    // ----------------------------------------------------------------
    async markPaid(payoutId: string, method: string, reference: string, adminId: string) {
        const existing = await this.prisma.payout.findUnique({
            where: { id: payoutId },
        });
        if (!existing) throw new NotFoundException(`Payout ${payoutId} not found`);
        if (existing.status === PayoutStatus.CANCELLED) {
            throw new BadRequestException('Cannot mark a cancelled payout as paid');
        }
        if (existing.status === PayoutStatus.PAID) {
            // Idempotent
            return existing;
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const payout = await tx.payout.update({
                where: { id: payoutId },
                data: {
                    status: PayoutStatus.PAID,
                    paidAt: new Date(),
                    method,
                    reference,
                },
            });

            // Post HOST_PAYOUT DEBIT ledger entry (no bookingId — use a sentinel booking lookup or skip the FK)
            // We need a bookingId for the ledger entry. Use the first PayoutItem's booking.
            const firstItem = await tx.payoutItem.findFirst({
                where: { payoutId },
                include: { ledgerEntry: true },
            });

            if (firstItem) {
                await tx.ledgerEntry.create({
                    data: {
                        bookingId: firstItem.ledgerEntry.bookingId,
                        type: LedgerEntryType.HOST_PAYOUT,
                        direction: LedgerDirection.DEBIT,
                        amount: payout.amount,
                        currency: payout.currency,
                        status: LedgerStatus.POSTED,
                        actorId: adminId,
                        metadata: {
                            payoutId,
                            method,
                            reference,
                            calcVersion: 'v1',
                        },
                    },
                });
            }

            return payout;
        });

        this.logger.log(`markPaid: payout ${payoutId} marked PAID, method=${method}, ref=${reference}`);
        return updated;
    }

    // ----------------------------------------------------------------
    // Dispute management
    // ----------------------------------------------------------------
    async openDispute(bookingId: string) {
        const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
        return this.prisma.booking.update({
            where: { id: bookingId },
            data: { disputeStatus: DisputeStatus.OPEN },
        });
    }

    async resolveDispute(bookingId: string) {
        const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
        return this.prisma.booking.update({
            where: { id: bookingId },
            data: { disputeStatus: DisputeStatus.RESOLVED },
        });
    }
}
