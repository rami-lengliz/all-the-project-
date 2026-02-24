import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { FlagListingDto } from './dto/flag-listing.dto';
import { LedgerService } from '../ledger/ledger.service';
import { PayoutsService } from '../payouts/payouts.service';
import { PayoutStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private ledgerService: LedgerService,
    private payoutsService: PayoutsService,
  ) { }

  async logAction(actorId: string, action: string, details?: Record<string, any>) {
    return this.prisma.adminLog.create({ data: { actorId, action, details } });
  }

  async getAllUsers() {
    return this.usersService.findAll();
  }

  async getAllListings() {
    return this.prisma.listing.findMany({
      where: { deletedAt: null },
      include: {
        host: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async flagListing(listingId: string, flagDto: FlagListingDto, actorId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found');
    await this.logAction(actorId, 'flag_listing', { listingId, reason: flagDto.reason });
    return { message: 'Listing flagged successfully', listingId };
  }

  async approveListing(listingId: string, actorId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found');
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'ACTIVE', isActive: true },
    });
    await this.logAction(actorId, 'approve_listing', { listingId });
    return updated;
  }

  async suspendListing(listingId: string, actorId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found');
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'SUSPENDED', isActive: false },
    });
    await this.logAction(actorId, 'suspend_listing', { listingId });
    return updated;
  }

  async getLogs(limit: number = 100) {
    return this.prisma.adminLog.findMany({
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ---- Ledger delegates ----
  async getLedgerSummary(from?: string, to?: string) {
    return this.ledgerService.getLedgerSummary(from, to);
  }

  async getHostBalance(hostId: string) {
    return this.ledgerService.getHostBalance(hostId);
  }

  async getBookingLedger(bookingId: string) {
    return this.ledgerService.getBookingLedger(bookingId);
  }

  // ---- Payout delegates ----
  async listPayouts(status?: string, page?: number, limit?: number) {
    const ps = status as PayoutStatus | undefined;
    return this.payoutsService.listPayouts(ps, page, limit);
  }

  async createPayout(
    hostId: string,
    amount: number,
    adminId: string,
    method?: string,
    reference?: string,
    notes?: string,
  ) {
    return this.payoutsService.createPayout(hostId, amount, adminId, method, reference, notes);
  }

  async markPayoutPaid(payoutId: string, method: string, reference: string, adminId: string) {
    return this.payoutsService.markPaid(payoutId, method, reference, adminId);
  }

  // ---- Dispute delegates ----
  async openDispute(bookingId: string) {
    return this.payoutsService.openDispute(bookingId);
  }

  async resolveDispute(bookingId: string) {
    return this.payoutsService.resolveDispute(bookingId);
  }
}
