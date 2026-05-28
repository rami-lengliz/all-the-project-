import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, WalletTransactionType, LedgerEntryType, LedgerDirection, LedgerStatus, TopUpIntent } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { KonnectProvider } from '../payments/providers/konnect.provider';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private konnect: KonnectProvider,
  ) {}

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId, balance: 0 },
        include: { transactions: true },
      });
    }

    const topUpIntents = await this.prisma.topUpIntent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
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

    return {
      ...wallet,
      balance: parseFloat(wallet.balance.toString()),
      topUpIntents: topUpIntents.map((i) => ({
        ...i,
        amount: parseFloat(i.amount.toString()),
      })),
    };
  }

  async topUp(userId: string, amount: number) {
    // Explicitly coerce — amount could arrive as a string if ValidationPipe transform
    // is misconfigured. Never trust the type declaration alone.
    const safeAmount = parseFloat(amount as any);
    if (!isFinite(safeAmount) || safeAmount <= 0) {
      throw new BadRequestException('Top-up amount must be a positive number');
    }

    return await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId, balance: 0 } });
      }

      const balanceBefore = parseFloat(wallet.balance.toString());
      const balanceAfter = parseFloat((balanceBefore + safeAmount).toFixed(2));

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          actorId: userId,
          type: LedgerEntryType.WALLET_TOP_UP,
          direction: LedgerDirection.CREDIT,
          amount: safeAmount,
          status: LedgerStatus.POSTED,
          metadata: { reason: 'simulated_top_up' },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: safeAmount,
          balanceBefore,
          balanceAfter,
          type: WalletTransactionType.TOP_UP,
          ledgerEntryId: ledgerEntry.id,
        },
      });

      return updatedWallet;
    });
  }

  async payForBooking(userId: string, bookingId: string, amount: number, tx: Prisma.TransactionClient) {
    // Atomic check and decrement using raw SQL or optimistic concurrency.
    // For simplicity with Prisma, we do read, check, update in transaction.
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    const balanceBefore = parseFloat(wallet.balance.toString());
    const safeAmount = parseFloat((amount as any).toString());
    if (balanceBefore < safeAmount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const balanceAfter = parseFloat((balanceBefore - safeAmount).toFixed(2));

    // Use Prisma's decrement to ensure atomic DB update against race conditions
    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: safeAmount } },
    });

    // Post-check just in case (though decrement should handle it)
    if (parseFloat(updatedWallet.balance.toString()) < 0) {
      throw new BadRequestException('Wallet balance cannot go negative');
    }

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: safeAmount,
        balanceBefore,
        balanceAfter: parseFloat(updatedWallet.balance.toString()),
        type: WalletTransactionType.PAYMENT,
        referenceId: bookingId,
      },
    });

    return updatedWallet;
  }

  // ─── Konnect Wallet Top-Up ────────────────────────────────────────────────

  /**
   * Create a Konnect hosted-checkout session for a wallet top-up.
   * Returns the redirect URL the user should be sent to.
   * The wallet is credited only after the Konnect webhook is verified.
   */
  async createKonnectTopUp(userId: string, amountTND: number): Promise<{ redirectUrl: string }> {
    const safe = parseFloat((amountTND as any).toString());
    if (!isFinite(safe) || safe <= 0) {
      throw new BadRequestException('Top-up amount must be a positive number');
    }
    if (!this.konnect.isConfigured()) {
      throw new BadRequestException('Konnect payment is not available right now.');
    }

    const frontendBase = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const backendBase =
      this.config.get<string>('BACKEND_PUBLIC_URL') ??
      this.config.get<string>('API_PUBLIC_URL') ??
      'http://localhost:3001';

    const result = await this.konnect.createPayment({
      amount: safe,
      currency: 'TND',
      successUrl: `${frontendBase}/client/wallet?topup=success`,
      failUrl: `${frontendBase}/client/wallet?topup=failed`,
      description: `RentEverything wallet top-up`,
      reference: userId,
      webhookUrl: `${backendBase}/api/wallet/konnect/webhook`,
    });

    await this.prisma.topUpIntent.create({
      data: {
        userId,
        amount: safe,
        currency: 'TND',
        provider: 'konnect',
        providerRef: result.providerRef,
        redirectUrl: result.redirectUrl,
        status: 'pending',
      },
    });

    this.logger.log(
      `Konnect top-up initiated: userId=${userId} amount=${safe} ref=${result.providerRef}`,
    );

    return { redirectUrl: result.redirectUrl };
  }

  /**
   * Handles the Konnect server-side webhook for wallet top-ups.
   * Fully idempotent — safe to call multiple times for the same payment_ref.
   * Credits wallet only after verifying amount + currency via Konnect API.
   */
  async handleKonnectTopUpWebhook(
    paymentRef: string,
  ): Promise<{ received: true; status: 'processed' | 'already_processed' | 'skipped' }> {
    if (!paymentRef?.trim()) {
      this.logger.warn('Konnect top-up webhook: missing payment_ref — ignoring');
      return { received: true, status: 'skipped' };
    }

    this.logger.log(`Konnect top-up webhook received: payment_ref=${paymentRef}`);

    const intent = await this.prisma.topUpIntent.findUnique({
      where: { providerRef: paymentRef },
    });

    if (!intent) {
      this.logger.warn(`Konnect top-up webhook: no TopUpIntent for providerRef=${paymentRef}`);
      return { received: true, status: 'skipped' };
    }

    if (intent.provider !== 'konnect') {
      this.logger.warn(`Konnect top-up webhook: provider mismatch for ref=${paymentRef}`);
      return { received: true, status: 'skipped' };
    }

    if (intent.status === 'processed') {
      this.logger.log(`Konnect top-up webhook: ref=${paymentRef} already processed`);
      return { received: true, status: 'already_processed' };
    }

    const details = await this.konnect.getPaymentDetails(paymentRef);
    if (!details) {
      this.logger.warn(`Konnect top-up webhook: could not fetch details for ref=${paymentRef}`);
      return { received: true, status: 'skipped' };
    }

    if (details.status.toLowerCase() !== 'completed') {
      this.logger.log(`Konnect top-up webhook: ref=${paymentRef} status="${details.status}" — skipping`);
      return { received: true, status: 'skipped' };
    }

    const expectedMillimes = Math.round(Number(intent.amount) * 1000);
    if (details.amount !== expectedMillimes) {
      this.logger.error(
        `[SUSPICIOUS] Konnect top-up amount mismatch: intentId=${intent.id} ` +
        `expected=${expectedMillimes}mM got=${details.amount}mM — BLOCKING`,
      );
      return { received: true, status: 'skipped' };
    }

    if (details.token && details.token.toUpperCase() !== 'TND') {
      this.logger.error(
        `[SUSPICIOUS] Konnect top-up currency mismatch: intentId=${intent.id} ` +
        `expected=TND got=${details.token} — BLOCKING`,
      );
      return { received: true, status: 'skipped' };
    }

    // Atomic: FOR UPDATE lock → credit wallet → post ledger → mark processed
    const credited = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<TopUpIntent[]>`
        SELECT * FROM top_up_intents WHERE id = ${intent.id} FOR UPDATE
      `;
      if (locked.status === 'processed') return false;

      let wallet = await tx.wallet.findUnique({ where: { userId: intent.userId } });
      if (!wallet) {
        wallet = await tx.wallet.create({ data: { userId: intent.userId, balance: 0 } });
      }

      const balanceBefore = parseFloat(wallet.balance.toString());
      const safeAmount = parseFloat(intent.amount.toString());
      const balanceAfter = parseFloat((balanceBefore + safeAmount).toFixed(2));

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          actorId: intent.userId,
          type: LedgerEntryType.WALLET_TOP_UP,
          direction: LedgerDirection.CREDIT,
          amount: safeAmount,
          status: LedgerStatus.POSTED,
          metadata: { topUpIntentId: intent.id, provider: 'konnect', providerRef: paymentRef },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: safeAmount,
          balanceBefore,
          balanceAfter,
          type: WalletTransactionType.TOP_UP,
          referenceId: intent.id,
          ledgerEntryId: ledgerEntry.id,
        },
      });

      await tx.topUpIntent.update({
        where: { id: intent.id },
        data: { status: 'processed', paidAt: new Date() },
      });

      return true;
    });

    if (!credited) {
      return { received: true, status: 'already_processed' };
    }

    this.logger.log(
      `Konnect top-up: userId=${intent.userId} credited ${intent.amount} TND (ref=${paymentRef})`,
    );
    return { received: true, status: 'processed' };
  }

  async refundToWallet(userId: string, bookingId: string, amount: number, tx: Prisma.TransactionClient) {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    // Idempotency check
    const existingRefund = await tx.walletTransaction.findFirst({
      where: {
        walletId: wallet.id,
        type: WalletTransactionType.REFUND,
        referenceId: bookingId,
      },
    });

    if (existingRefund) {
      // Already refunded, idempotent return
      return wallet;
    }

    const balanceBefore = parseFloat(wallet.balance.toString());
    const safeRefundAmount = parseFloat((amount as any).toString());

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: safeRefundAmount } },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: safeRefundAmount,
        balanceBefore,
        balanceAfter: parseFloat(updatedWallet.balance.toString()),
        type: WalletTransactionType.REFUND,
        referenceId: bookingId,
      },
    });

    return updatedWallet;
  }
}
