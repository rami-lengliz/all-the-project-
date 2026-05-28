/**
 * Common shape every real-money payment gateway has to implement.
 *
 * New providers (Konnect, D17, Stripe, etc.) drop in by writing a new class
 * that satisfies this interface — no changes needed in PaymentsService,
 * BookingsService, or the ledger.
 */

export type ProviderKey = 'flouci' | 'konnect' | 'd17';

export type ProviderPaymentStatus =
  | 'pending'   // user has not paid yet (we just created the link)
  | 'success'   // user has paid and provider confirms
  | 'failed'    // payment attempt failed
  | 'cancelled';// user cancelled or it expired

export interface CreatePaymentInput {
  /** Whole units in the listing currency (e.g. 120 = 120 TND). */
  amount: number;
  currency: 'TND';
  /** Where to send the user after the gateway is done. */
  successUrl: string;
  failUrl: string;
  /** Free-text we want to see back on the receipt. */
  description: string;
  /** Booking id or top-up intent id — surfaced in the provider's dashboard for reconciliation. */
  reference: string;
  /** Override the default booking webhook URL (e.g. for wallet top-ups). */
  webhookUrl?: string;
}

export interface CreatePaymentOutput {
  /** Provider's id for this payment — we store this as `providerRef`. */
  providerRef: string;
  /** URL the user should be redirected to in order to pay. */
  redirectUrl: string;
}

export interface PaymentProvider {
  readonly key: ProviderKey;

  /** True when the gateway is configured (env vars set). */
  isConfigured(): boolean;

  /** Create a payment session and return a checkout URL. */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput>;

  /**
   * Verify the current status of a payment by re-querying the provider.
   * Never trust the redirect's query string — always call this to confirm.
   */
  verifyPayment(providerRef: string): Promise<ProviderPaymentStatus>;
}
