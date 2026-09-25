import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { LavaTopClient, type LavaTopCurrency, type LavaTopPeriodicity } from './lavaTopClient.js';

export type Plan = 'monthly' | 'yearly';

export interface CheckoutInput {
  email: string;
  plan: Plan;
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
  #offerIdByPlan: Record<Plan, string | undefined>;
  #currency: LavaTopCurrency;

  constructor(env: Pick<Env, 'LAVA_TOP_API_KEY' | 'LAVA_TOP_BASE_URL' | 'LAVA_TOP_OFFER_ID_MONTHLY' | 'LAVA_TOP_OFFER_ID_YEARLY'>) {
    if (!env.LAVA_TOP_API_KEY) throw new Error('LAVA_TOP_API_KEY is not set — required for the lava_top payment provider.');
    this.#client = new LavaTopClient(env.LAVA_TOP_API_KEY, env.LAVA_TOP_BASE_URL);
    this.#offerIdByPlan = { monthly: env.LAVA_TOP_OFFER_ID_MONTHLY, yearly: env.LAVA_TOP_OFFER_ID_YEARLY };
    // Existing frontend prices are quoted in ₽ — RUB is the only currency this app sells in for now.
    this.#currency = 'RUB';
  }

  async createCheckout({ email, plan }: CheckoutInput): Promise<CheckoutOutput> {
    const offerId = this.#offerIdByPlan[plan];
    if (!offerId) throw new Error(`LAVA_TOP_OFFER_ID_${plan.toUpperCase()} is not set — required to sell the "${plan}" plan via Lava.top.`);
    const invoice = await this.#client.createInvoice({ email, offerId, currency: this.#currency, periodicity: PERIODICITY_BY_PLAN[plan] });
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
