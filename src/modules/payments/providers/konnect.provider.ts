import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreatePaymentInput,
  CreatePaymentOutput,
  PaymentProvider,
  ProviderKey,
  ProviderPaymentStatus,
} from './payment-provider.interface';

/**
 * Konnect hosted-checkout integration.
 *
 * Docs: https://api.konnect.network/api/v2
 *
 * Required env:
 *   KONNECT_API_KEY              - Server-side API key (never exposed to frontend)
 *   KONNECT_RECEIVER_WALLET_ID   - Merchant wallet that receives funds
 *   KONNECT_API_BASE_URL         - https://api.sandbox.konnect.network/api/v2 (sandbox)
 *                                  or https://api.konnect.network/api/v2 (prod)
 *   BACKEND_PUBLIC_URL           - Public URL of this backend (for the webhook callback)
 *
 * Amounts are sent in millimes (1 TND = 1000 millimes). The rest of the
 * codebase works in TND — conversion happens only at this provider boundary.
 */
@Injectable()
export class KonnectProvider implements PaymentProvider {
  readonly key: ProviderKey = 'konnect';
  private readonly logger = new Logger(KonnectProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('KONNECT_API_KEY');
  }

  private get receiverWalletId(): string | undefined {
    return this.config.get<string>('KONNECT_RECEIVER_WALLET_ID');
  }

  private get apiBaseUrl(): string {
    return (
      this.config.get<string>('KONNECT_API_BASE_URL') ??
      'https://api.sandbox.konnect.network/api/v2'
    );
  }

  private get backendPublicUrl(): string {
    return (
      this.config.get<string>('BACKEND_PUBLIC_URL') ??
      this.config.get<string>('API_PUBLIC_URL') ??
      'http://localhost:3001'
    );
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim()) && Boolean(this.receiverWalletId?.trim());
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Konnect is not configured on this server');
    }
  }

  /** Safe integer millimes conversion — never uses floating-point division. */
  private toMillimes(tnd: number): number {
    if (tnd <= 0) throw new ServiceUnavailableException('Payment amount must be greater than 0');
    return Math.round(tnd * 1000);
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
    this.assertConfigured();

    const webhookUrl = input.webhookUrl ?? `${this.backendPublicUrl}/api/payments/konnect/webhook`;
    const amountMillimes = this.toMillimes(input.amount);

    const body = {
      receiverWalletId: this.receiverWalletId,
      token: 'TND',
      amount: amountMillimes,
      type: 'immediate',
      description: input.description,
      acceptedPaymentMethods: ['wallet', 'bank_card', 'e-DINAR'],
      lifespan: 60,
      checkoutForm: false,
      addPaymentFeesToAmount: false,
      orderId: input.reference,
      webhook: webhookUrl,
      successUrl: input.successUrl,
      failUrl: input.failUrl,
      silentWebhook: true,
    };

    const response = await fetch(`${this.apiBaseUrl}/payments/init-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Konnect init-payment failed (${response.status}): ${text}`);
      throw new ServiceUnavailableException(
        'Could not contact the payment provider. Please try again.',
      );
    }

    const data = (await response.json()) as {
      paymentRef?: string;
      payUrl?: string;
    };

    if (!data?.paymentRef || !data?.payUrl) {
      this.logger.error(`Konnect returned unexpected payload: ${JSON.stringify(data)}`);
      throw new ServiceUnavailableException('Payment provider returned an invalid response.');
    }

    this.logger.log(
      `Konnect checkout created: orderId=${input.reference} ref=${data.paymentRef}`,
    );

    return {
      providerRef: data.paymentRef,
      redirectUrl: data.payUrl,
    };
  }

  async verifyPayment(providerRef: string): Promise<ProviderPaymentStatus> {
    const details = await this.getPaymentDetails(providerRef);
    if (!details) return 'pending'; // transient fetch error — don't prematurely fail

    const status = details.status.toLowerCase();
    if (status === 'completed') return 'success';
    if (status === 'pending' || status === 'waiting') return 'pending';
    if (status === 'failed' || status === 'expired' || status === 'cancelled') return 'failed';

    this.logger.warn(`Konnect returned unknown status "${status}" for ref ${providerRef}`);
    return 'pending';
  }

  /**
   * Fetch raw payment details from Konnect for amount/currency verification.
   * Returns null on a transient HTTP error so the caller can decide whether
   * to abort or retry, rather than treating a 5xx as a payment failure.
   */
  async getPaymentDetails(providerRef: string): Promise<KonnectPaymentDetails | null> {
    this.assertConfigured();

    const response = await fetch(
      `${this.apiBaseUrl}/payments/${encodeURIComponent(providerRef)}`,
      {
        method: 'GET',
        headers: { 'x-api-key': this.apiKey! },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(
        `Konnect get-payment-details failed (${response.status}) for ref=${providerRef}: ${text}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      payment?: {
        status?: string;
        amount?: number;
        token?: string;
        currency?: string;
        orderId?: string;
      };
    };

    if (!data?.payment) {
      this.logger.error(
        `Konnect get-payment-details: missing payment object for ref=${providerRef}`,
      );
      return null;
    }

    return {
      status: data.payment.status ?? 'unknown',
      amount: data.payment.amount ?? 0,
      token: data.payment.token ?? data.payment.currency ?? 'TND',
      orderId: data.payment.orderId,
    };
  }
}

export interface KonnectPaymentDetails {
  status: string;
  /** Amount in millimes (Konnect native unit). */
  amount: number;
  /** Currency token — "TND" in production. */
  token: string;
  orderId?: string;
}
