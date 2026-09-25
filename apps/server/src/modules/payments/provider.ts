import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { LavaTopClient, type LavaTopPeriodicity } from './lavaTopClient.js';

export type Plan = 'monthly' | 'yearly';
export type Currency = 'USD' | 'EUR';

export interface CheckoutInput {
  email: string;
  plan: Plan;
  currency: Currency;
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

type OfferEnv = 'LAVA_TOP_OFFER_ID_MONTHLY_USD' | 'LAVA_TOP_OFFER_ID_MONTHLY_EUR' | 'LAVA_TOP_OFFER_ID_YEARLY_USD' | 'LAVA_TOP_OFFER_ID_YEARLY_EUR';

export class LavaTopPaymentProvider implements PaymentProvider {
  name = 'lava_top';

  #client: LavaTopClient;
  #offerIdByPlanCurrency: Record<Plan, Record<Currency, string | undefined>>;

  constructor(env: Pick<Env, 'LAVA_TOP_API_KEY' | 'LAVA_TOP_BASE_URL' | OfferEnv>) {
    if (!env.LAVA_TOP_API_KEY) throw new Error('LAVA_TOP_API_KEY is not set — required for the lava_top payment provider.');
    this.#client = new LavaTopClient(env.LAVA_TOP_API_KEY, env.LAVA_TOP_BASE_URL);
    this.#offerIdByPlanCurrency = {
      monthly: { USD: env.LAVA_TOP_OFFER_ID_MONTHLY_USD, EUR: env.LAVA_TOP_OFFER_ID_MONTHLY_EUR },
      yearly: { USD: env.LAVA_TOP_OFFER_ID_YEARLY_USD, EUR: env.LAVA_TOP_OFFER_ID_YEARLY_EUR },
    };
  }

  async createCheckout({ email, plan, currency }: CheckoutInput): Promise<CheckoutOutput> {
    const offerId = this.#offerIdByPlanCurrency[plan][currency];
    if (!offerId) {
      throw new Error(`LAVA_TOP_OFFER_ID_${plan.toUpperCase()}_${currency} is not set — required to sell the "${plan}" plan in ${currency} via Lava.top.`);
    }
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
