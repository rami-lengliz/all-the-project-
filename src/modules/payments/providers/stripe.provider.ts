import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CreatePaymentInput,
  CreatePaymentOutput,
  PaymentProvider,
  ProviderKey,
  ProviderPaymentStatus,
} from './payment-provider.interface';

/**
 * Stripe Checkout integration (redirect / hosted-checkout flow).
 *
 * Maps onto the same redirect contract every other provider uses:
 *   createPayment  → Stripe Checkout Session  → { providerRef: session.id, redirectUrl: session.url }
 *   verifyPayment  → sessions.retrieve        → payment_status === 'paid' → success
 *
 * Because Checkout `success_url` is a *browser* redirect (not a server-to-server
 * webhook), the whole flow works on localhost with no public tunnel — Stripe
 * sends the user's browser back to /api/payments/stripe/callback, which then
 * verifies the session server-to-server before finalising the booking.
 *
 * Required env:
 *   STRIPE_SECRET_KEY  - sk_test_... (test mode) or sk_live_... (production)
 * Optional env:
 *   STRIPE_CURRENCY    - presentment currency (default "tnd"). Use "usd"/"eur"
 *                        if your Stripe account can't present in TND.
 *
 * Test card for the demo: 4242 4242 4242 4242, any future expiry, any CVC/ZIP.
 */
@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly key: ProviderKey = 'stripe';
  private readonly logger = new Logger(StripeProvider.name);
  private stripe: InstanceType<typeof Stripe> | null = null;

  // Three-decimal currencies (amount in smallest unit must be a multiple of 10).
  private static readonly THREE_DECIMAL = ['tnd', 'kwd', 'bhd', 'omr', 'jod', 'iqd'];
  // Zero-decimal currencies (smallest unit is the major unit).
  private static readonly ZERO_DECIMAL = ['jpy', 'krw', 'vnd', 'clp', 'xof', 'xpf'];

  constructor(private readonly config: ConfigService) {}

  private get secretKey(): string | undefined {
    return this.config.get<string>('STRIPE_SECRET_KEY');
  }

  private get currency(): string {
    return (this.config.get<string>('STRIPE_CURRENCY') ?? 'tnd').trim().toLowerCase();
  }

  isConfigured(): boolean {
    const t = this.secretKey?.trim();
    return !!t && (t.startsWith('sk_test_') || t.startsWith('sk_live_'));
  }

  private client(): InstanceType<typeof Stripe> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Stripe is not configured on this server');
    }
    if (!this.stripe) {
      this.stripe = new Stripe(this.secretKey!);
    }
    return this.stripe;
  }

  /** Convert a whole-unit amount to Stripe's smallest currency unit. */
  private toSmallestUnit(amount: number, currency: string): number {
    if (amount <= 0) {
      throw new ServiceUnavailableException('Payment amount must be greater than 0');
    }
    if (StripeProvider.ZERO_DECIMAL.includes(currency)) {
      return Math.round(amount);
    }
    if (StripeProvider.THREE_DECIMAL.includes(currency)) {
      // ×1000, but forced to a multiple of 10 as Stripe requires for 3-decimal.
      return Math.round(amount * 100) * 10;
    }
    return Math.round(amount * 100);
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
    const stripe = this.client();
    const currency = this.currency;
    const unitAmount = this.toSmallestUnit(input.amount, currency);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: { name: input.description },
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.failUrl,
      client_reference_id: input.reference,
      metadata: { reference: input.reference },
    });

    if (!session.url) {
      this.logger.error(`Stripe session ${session.id} created without a checkout URL`);
      throw new ServiceUnavailableException('Payment provider returned an invalid response.');
    }

    this.logger.log(
      `Stripe checkout created: ref=${input.reference} session=${session.id} (${unitAmount} ${currency})`,
    );

    return { providerRef: session.id, redirectUrl: session.url };
  }

  async verifyPayment(providerRef: string): Promise<ProviderPaymentStatus> {
    const stripe = this.client();

    try {
      const session = await stripe.checkout.sessions.retrieve(providerRef);
      if (
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required'
      ) {
        return 'success';
      }
      if (session.status === 'expired') return 'failed';
      // status 'open' / payment_status 'unpaid' → user hasn't completed yet.
      return 'pending';
    } catch (err: any) {
      // Transient fetch error — don't prematurely fail the payment.
      this.logger.error(`Stripe retrieve failed for ${providerRef}: ${err?.message ?? err}`);
      return 'pending';
    }
  }
}
