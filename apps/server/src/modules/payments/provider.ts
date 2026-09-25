import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { LavaTopClient, type LavaTopPeriodicity } from './lavaTopClient.js';

export type Plan = 'monthly' | 'yearly';
export type Currency = 'USD' | 'EUR' | 'RUB';

export interface CheckoutInput {
  email: string;
  plan: Plan;
  currency: Currency;
  /** Looked up by the caller from the admin-managed payment_plans table — this provider never reads it from env/config itself. */
  offerId: string;
}

export interface CheckoutOutput {
  externalId: string;
  paymentUrl: string;
  /** Mock provider only — tells the caller to mark the payment paid and extend premium immediately, so the whole checkout flow is clickable in dev without real Lava.top credentials. */
  instantlyPaid?: boolean;
}

export interface PaymentProvider {
  name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutOutput>;
}

const PERIODICITY_BY_PLAN: Record<Plan, LavaTopPeriodicity> = { monthly: 'MONTHLY', yearly: 'PERIOD_YEAR' };

export class LavaTopPaymentProvider implements PaymentProvider {
  name = 'lava_top';

  #client: LavaTopClient;

  constructor(env: Pick<Env, 'LAVA_TOP_API_KEY' | 'LAVA_TOP_BASE_URL'>) {
    if (!env.LAVA_TOP_API_KEY) throw new Error('LAVA_TOP_API_KEY is not set — required for the lava_top payment provider.');
    this.#client = new LavaTopClient(env.LAVA_TOP_API_KEY, env.LAVA_TOP_BASE_URL);
  }

  async createCheckout({ email, plan, currency, offerId }: CheckoutInput): Promise<CheckoutOutput> {
    const invoice = await this.#client.createInvoice({ email, offerId, currency, periodicity: PERIODICITY_BY_PLAN[plan] });
    return { externalId: invoice.id, paymentUrl: invoice.paymentUrl };
  }
}

/** Deterministic, no network — same "make the whole flow clickable without real credentials" role as MockGradingProvider/MockProductionJudgeProvider in @app/shared. */
export class MockPaymentProvider implements PaymentProvider {
  name = 'mock';

  #frontendUrl: string;

  constructor(frontendUrl: string) {
    this.#frontendUrl = frontendUrl;
  }

  async createCheckout({ plan }: CheckoutInput): Promise<CheckoutOutput> {
    return {
      externalId: `mock-${randomUUID()}`,
      paymentUrl: `${this.#frontendUrl}?mockPayment=success&plan=${plan}`,
      instantlyPaid: true,
    };
  }
}
