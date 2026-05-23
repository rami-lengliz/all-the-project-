import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { FlagListingDto } from './dto/flag-listing.dto';
import { LedgerService } from '../ledger/ledger.service';
import { PayoutsService } from '../payouts/payouts.service';
import { WalletService } from '../wallet/wallet.service';
import { PayoutStatus, ListingStatus, LedgerEntryType, LedgerDirection, LedgerStatus, WalletTransactionType } from '@prisma/client';
import { ChatbotTrustScoreService } from '../../chatbot/trust/chatbot-trust-score.service';
import { ChatbotRateLimitService } from '../../chatbot/trust/chatbot-rate-limit.service';
import { AdjustmentDirection } from './dto/wallet-adjust.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private ledgerService: LedgerService,
    private payoutsService: PayoutsService,
    private walletService: WalletService,
    private trustScoreService: ChatbotTrustScoreService,
  ) {}

  async logAction(
    actorId: string,
    action: string,
    details?: Record<string, any>,
  ) {
    return this.prisma.adminLog.create({ data: { actorId, action, details } });
  }

  async getAllUsers(search?: string) {
    return this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roles: true,
        isHost: true,
        ratingAvg: true,
        ratingCount: true,
        createdAt: true,
        suspendedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserListings(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.listing.findMany({
      where: { hostId: userId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        pricePerDay: true,
        address: true,
        images: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        roles: true,
        isHost: true,
        verifiedEmail: true,
        verifiedPhone: true,
        ratingAvg: true,
        ratingCount: true,
        createdAt: true,
        suspendedAt: true,
        _count: {
          select: {
            listings: true,
            bookingsAsRenter: true,
            bookingsAsHost: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getUserLogs(userId: string) {
    const logs = await this.prisma.adminLog.findMany({
      where: {
        details: {
          path: ['userId'],
          equals: userId,
        },
      },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return logs.map((log) => {
      const details = (log.details as any) || {};
      return {
        id: log.id,
        action: log.action,
        createdAt: log.createdAt,
        actor: log.actor,
        reason: details.reason || null,
        previousSuspendedAt: details.previousSuspendedAt || null,
        newSuspendedAt: details.newSuspendedAt || null,
      };
    });
  }

  async suspendUser(targetUserId: string, actorId: string, reason: string) {
    if (targetUserId === actorId)
      throw new BadRequestException('You cannot suspend your own account');
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('User not found');

    const roles = (user.roles ?? []).map((r) => String(r).toUpperCase());
    if (roles.includes('ADMIN'))
      throw new BadRequestException('Admin accounts cannot be suspended');
    if (user.suspendedAt)
      throw new BadRequestException('User is already suspended');

    const now = new Date();
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { suspendedAt: now },
    });
    await this.logAction(actorId, 'suspend_user', {
      userId: targetUserId,
      reason,
      previousSuspendedAt: null,
      newSuspendedAt: now.toISOString(),
    });
    return { message: 'User suspended', userId: targetUserId };
  }

  async unsuspendUser(targetUserId: string, actorId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.suspendedAt)
      throw new BadRequestException('User is not currently suspended');

    const previousSuspendedAt = user.suspendedAt;
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { suspendedAt: null },
    });
    await this.logAction(actorId, 'unsuspend_user', {
      userId: targetUserId,
      reason,
      previousSuspendedAt: previousSuspendedAt.toISOString(),
      newSuspendedAt: null,
    });
    return { message: 'User unsuspended', userId: targetUserId };
  }

  async getAllListings(status?: ListingStatus) {
    return this.prisma.listing.findMany({
      where: { 
        deletedAt: null,
        ...(status ? { status } : {})
      },
      include: {
        host: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getListingDetails(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId, deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        pricePerDay: true,
        address: true,
        images: true,
        createdAt: true,
        isActive: true,
        host: { select: { id: true, name: true, email: true, ratingAvg: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async getListingLogs(listingId: string) {
    // Prisma JSON filtering syntax for PostgreSQL:
    // We look for logs where the 'listingId' key inside the `details` JSONB field matches the given ID.
    const logs = await this.prisma.adminLog.findMany({
      where: {
        details: {
          path: ['listingId'],
          equals: listingId,
        },
      },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return logs.map((log) => {
      const details = (log.details as any) || {};
      return {
        id: log.id,
        action: log.action,
        createdAt: log.createdAt,
        actor: log.actor,
        reason: details.reason || null,
        previousStatus: details.previousStatus || null,
        newStatus: details.newStatus || null,
      };
    });
  }
  async flagListing(
    listingId: string,
    flagDto: FlagListingDto,
    actorId: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing || listing.deletedAt)
      throw new NotFoundException('Listing not found');
    await this.logAction(actorId, 'flag_listing', {
      listingId,
      reason: flagDto.reason,
    });
    return { message: 'Listing flagged successfully', listingId };
  }

  async approveListing(listingId: string, actorId: string, reason?: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing || listing.deletedAt)
      throw new NotFoundException('Listing not found');
    if (listing.status === 'ACTIVE')
      throw new BadRequestException('Listing is already active');
      
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'ACTIVE', isActive: true },
    });
    await this.logAction(actorId, 'approve_listing', { 
      listingId, 
      reason,
      previousStatus: listing.status,
      newStatus: 'ACTIVE'
    });
    return updated;
  }

  async suspendListing(listingId: string, actorId: string, reason: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing || listing.deletedAt)
      throw new NotFoundException('Listing not found');
    if (listing.status === 'SUSPENDED')
      throw new BadRequestException('Listing is already suspended');

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'SUSPENDED', isActive: false },
    });
    await this.logAction(actorId, 'suspend_listing', { 
      listingId, 
      reason,
      previousStatus: listing.status,
      newStatus: 'SUSPENDED'
    });
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

  async getPayoutDetails(id: string) {
    return this.payoutsService.getPayoutDetails(id);
  }

  async createPayout(
    hostId: string,
    amount: number,
    adminId: string,
    method?: string,
    reference?: string,
    notes?: string,
  ) {
    const result = await this.payoutsService.createPayout(
      hostId,
      amount,
      adminId,
      method,
      reference,
      notes,
    );
    await this.logAction(adminId, 'create_payout', {
      hostId,
      amount,
      payoutId: result.payout.id,
      itemsCount: result.itemsCount,
    });
    return result;
  }

  async markPayoutPaid(
    payoutId: string,
    method: string,
    reference: string,
    adminId: string,
  ) {
    const result = await this.payoutsService.markPaid(
      payoutId,
      method,
      reference,
      adminId,
    );
    await this.logAction(adminId, 'mark_payout_paid', {
      payoutId,
      method,
      reference,
    });
    return result;
  }

  // ---- Dispute delegates ----
  async openDispute(bookingId: string, adminId: string) {
    const result = await this.payoutsService.openDispute(bookingId);
    await this.logAction(adminId, 'open_dispute', { bookingId });
    return result;
  }

  async resolveDispute(bookingId: string, adminId: string) {
    const result = await this.payoutsService.resolveDispute(bookingId);
    await this.logAction(adminId, 'resolve_dispute', { bookingId });
    return result;
  }

  // ---- Trust & Abuse visibility (Batch 3) ----

  /**
   * Returns a queue of users with suspicious activity
   * (non-NORMAL trust tier OR recent high-severity security events)
   */
  async getSuspiciousUsers() {
    // 1. Get users with recent security events
    const recentEvents = await this.prisma.chatbotSecurityEvent.findMany({
      where: {
        createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      },
      select: { userId: true, severity: true, createdAt: true },
    });

    const userIds = [...new Set(recentEvents.map((e) => e.userId))];

    // 2. Evaluate trust for these users
    const suspicious = [];
    for (const userId of userIds) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, suspendedAt: true, trustReviewedAt: true, manualTrustTier: true },
      });
      if (!user) continue;

      const trust = await this.trustScoreService.evaluateUserTrust(userId);
      
      // Filter logic:
      // Include if (non-NORMAL tier) OR (recent high-severity events)
      // BUT exclude if all relevant events are before trustReviewedAt
      const userEvents = recentEvents.filter((e) => e.userId === userId);
      const latestEventTime = userEvents.length > 0 ? Math.max(...userEvents.map(e => e.createdAt.getTime())) : 0;
      
      const hasNewCriticalEvents = userEvents.some(e => (e.severity === 'high' || e.severity === 'critical') && (!user.trustReviewedAt || e.createdAt > user.trustReviewedAt));
      const isCurrentlySuspicious = trust.tier !== 'NORMAL' && (!user.trustReviewedAt || latestEventTime > user.trustReviewedAt.getTime());

      if (isCurrentlySuspicious || hasNewCriticalEvents || user.manualTrustTier) {
        suspicious.push({
          ...user,
          trustTier: trust.tier,
          reasons: trust.reasons,
          eventCount: userEvents.length,
          isManual: !!user.manualTrustTier,
        });
      }
    }

    return suspicious;
  }

  /**
   * Returns the trust profile for a specific user
   */
  async getUserTrustProfile(userId: string) {
    const trust = await this.trustScoreService.evaluateUserTrust(userId);
    const events = await this.prisma.chatbotSecurityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        conversation: {
          select: { id: true, createdAt: true }
        }
      }
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { manualTrustTier: true, trustReviewedAt: true, suspendedAt: true }
    });

    return {
      userId,
      tier: trust.tier,
      reasons: trust.reasons,
      suggestedRestrictions: trust.suggestedRestrictions,
      manualTier: user?.manualTrustTier || null,
      reviewedAt: user?.trustReviewedAt || null,
      suspendedAt: user?.suspendedAt || null,
      events: events.map(e => ({
        id: e.id,
        eventType: e.eventType,
        severity: e.severity,
        reasonCode: e.reasonCode,
        createdAt: e.createdAt,
        metadata: e.metadata,
        conversationId: e.conversationId
      }))
    };
  }

  // ---- Trust & Abuse actions (Batch 4) ----

  async markTrustReviewed(userId: string, actorId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { trustReviewedAt: now },
    });

    await this.logAction(actorId, 'mark_trust_reviewed', {
      userId,
      reason,
      reviewedAt: now.toISOString(),
    });

    return { message: 'Trust case marked as reviewed', userId };
  }

  async updateTrustTier(userId: string, tier: string | null, actorId: string, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Validate tier
    const validTiers = ['NORMAL', 'LIMITED', 'SUSPICIOUS', 'RESTRICTED'];
    if (tier && !validTiers.includes(tier.toUpperCase())) {
      throw new BadRequestException(`Invalid trust tier. Must be one of: ${validTiers.join(', ')}`);
    }

    const previousTier = user.manualTrustTier;
    await this.prisma.user.update({
      where: { id: userId },
      data: { manualTrustTier: tier ? tier.toUpperCase() : null },
    });

    await this.logAction(actorId, 'update_trust_tier', {
      userId,
      reason,
      previousTier,
      newTier: tier ? tier.toUpperCase() : 'AUTOMATIC',
    });

    return { message: 'User trust tier updated', userId, tier: tier || 'AUTOMATIC' };
  }

  // ---- Payment visibility ----

  async getBookingPayment(bookingId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { bookingId },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        provider: true,
        providerRef: true,
        redirectUrl: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
        renter: { select: { id: true, name: true, email: true } },
        host: { select: { id: true, name: true, email: true } },
      },
    });
    if (!intent) throw new NotFoundException(`No payment intent for booking ${bookingId}`);
    return intent;
  }

  // ---- Wallet Oversight (Batch 3) ----

  /**
   * List all wallets with user info and aggregate stats.
   * Returns wallets sorted by balance descending.
   */
  async getAllWallets() {
    const wallets = await this.prisma.wallet.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true, roles: true, suspendedAt: true },
        },
        _count: { select: { transactions: true } },
      },
      orderBy: { balance: 'desc' },
    });

    // Aggregate stats
    let totalBalance = 0;
    let totalTopUps = 0;
    let totalPayments = 0;
    let totalRefunds = 0;
    let walletCount = wallets.length;

    for (const w of wallets) {
      totalBalance += parseFloat(w.balance.toString());
    }

    // Get aggregate transaction counts by type
    const txCounts = await this.prisma.walletTransaction.groupBy({
      by: ['type'],
      _count: true,
      _sum: { amount: true },
    });

    for (const tc of txCounts) {
      const sum = parseFloat(tc._sum?.amount?.toString() ?? '0');
      if (tc.type === 'TOP_UP') totalTopUps = sum;
      if (tc.type === 'PAYMENT') totalPayments = sum;
      if (tc.type === 'REFUND') totalRefunds = sum;
    }

    return {
      wallets: wallets.map((w) => ({
        userId: w.userId,
        balance: parseFloat(w.balance.toString()),
        currency: w.currency,
        transactionCount: w._count.transactions,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        user: w.user,
      })),
      summary: {
        walletCount,
        totalBalance: +totalBalance.toFixed(2),
        totalTopUps: +totalTopUps.toFixed(2),
        totalPayments: +totalPayments.toFixed(2),
        totalRefunds: +totalRefunds.toFixed(2),
        currency: 'TND',
      },
    };
  }

  /**
   * Get a single user's wallet with full transaction history.
   */
  async getWalletDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, roles: true, suspendedAt: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            ledgerEntry: {
              select: { id: true, type: true, direction: true, status: true, metadata: true },
            },
          },
        },
      },
    });

    const topUpIntents = await this.prisma.topUpIntent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        amount: true,
        currency: true,
        provider: true,
        providerRef: true,
        status: true,
        paidAt: true,
        createdAt: true,
      },
    });

    if (!wallet) {
      return {
        user,
        wallet: null,
        balance: 0,
        currency: 'TND',
        transactions: [],
        topUpIntents: topUpIntents.map((i) => ({
          ...i,
          amount: parseFloat(i.amount.toString()),
        })),
      };
    }

    return {
      user,
      wallet: {
        id: wallet.id,
        balance: parseFloat(wallet.balance.toString()),
        currency: wallet.currency,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      },
      transactions: wallet.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount.toString()),
        balanceBefore: parseFloat(t.balanceBefore.toString()),
        balanceAfter: parseFloat(t.balanceAfter.toString()),
        referenceId: t.referenceId,
        ledgerEntryId: t.ledgerEntryId,
        ledgerEntry: t.ledgerEntry,
        createdAt: t.createdAt,
      })),
      topUpIntents: topUpIntents.map((i) => ({
        ...i,
        amount: parseFloat(i.amount.toString()),
      })),
    };
  }

  /**
   * Admin wallet adjustment: credit or debit with mandatory reason.
   * Creates a WalletTransaction (ADJUSTMENT), a LedgerEntry, and an AdminLog.
   */
  async adjustWallet(
    userId: string,
    amount: number,
    direction: AdjustmentDirection,
    reason: string,
    adminId: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Adjustment amount must be positive');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId, balance: 0 } });
      }

      const balanceBefore = parseFloat(wallet.balance.toString());

      if (direction === AdjustmentDirection.DEBIT && balanceBefore < amount) {
        throw new BadRequestException(
          `Insufficient balance for debit adjustment. Current: ${balanceBefore.toFixed(2)}, requested: ${amount.toFixed(2)}`,
        );
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance:
            direction === AdjustmentDirection.CREDIT
              ? { increment: amount }
              : { decrement: amount },
        },
      });

      const balanceAfter = parseFloat(updatedWallet.balance.toString());

      // Create ledger entry for the adjustment
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          actorId: adminId,
          type: LedgerEntryType.WALLET_TOP_UP, // Reuse existing type; metadata distinguishes admin adjustments
          direction: direction === AdjustmentDirection.CREDIT ? LedgerDirection.CREDIT : LedgerDirection.DEBIT,
          amount,
          status: LedgerStatus.POSTED,
          metadata: {
            reason,
            adjustmentType: 'admin_adjustment',
            targetUserId: userId,
            direction,
          },
        },
      });

      // Create wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount,
          balanceBefore,
          balanceAfter,
          type: WalletTransactionType.ADJUSTMENT,
          ledgerEntryId: ledgerEntry.id,
        },
      });

      // Audit log
      await this.logAction(adminId, 'wallet_adjustment', {
        userId,
        direction,
        amount,
        balanceBefore,
        balanceAfter,
        reason,
        ledgerEntryId: ledgerEntry.id,
      });

      return {
        message: `Wallet ${direction.toLowerCase()} applied`,
        userId,
        direction,
        amount,
        balanceBefore,
        balanceAfter,
        currency: updatedWallet.currency,
      };
    });
  }
}
