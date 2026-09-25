import { useState } from 'react';
import { getJson, postJson } from './collections';

export type Plan = 'monthly' | 'yearly';
export type Currency = 'USD' | 'EUR' | 'RUB';

// Title and prices are admin-managed (payment_plans table, admin "Платежи"
// page) — fetched via fetchPaymentPlans() below. This blurb line is the one
// bit of marketing copy that isn't, since the admin form only asks for
// name/link/prices, not freeform benefit text. Yearly's own blurb is
// computed from real prices instead (see yearlySavingsPercent below).
export const PLAN_BLURB: Record<Plan, string> = {
  monthly: 'без обязательств',
  yearly: 'выгоднее в пересчёте на месяц',
};

export const CURRENCIES: Record<Currency, { label: string; symbol: string }> = {
  USD: { label: 'Доллары США', symbol: '$' },
  EUR: { label: 'Евро', symbol: '€' },
  RUB: { label: 'Рубли', symbol: '₽' },
};

export interface PaymentPlanInfo {
  plan: Plan;
  title: string;
  priceUsd: string | null;
  priceEur: string | null;
  priceRub: string | null;
}

/** Public — no auth needed, used by the checkout stepper to show real plan names/prices instead of a hardcoded guess. */
export async function fetchPaymentPlans(): Promise<PaymentPlanInfo[]> {
  const data = await getJson<{ plans: PaymentPlanInfo[] }>('/api/payments/plans');
  return data.plans;
}

const PRICE_FIELD: Record<Currency, keyof PaymentPlanInfo> = { USD: 'priceUsd', EUR: 'priceEur', RUB: 'priceRub' };

/**
 * "Выгоднее на ~X%" for the yearly plan vs. 12× the monthly price. Computed
 * separately per currency the admin priced both plans in, then the SMALLEST
 * of those percentages is returned — the most conservative claim, since
 * which currency the learner actually pays in is only decided on the next
 * step (e.g. 20% cheaper in RUB but 90% in EUR shows as ~20%, never ~90%).
 * Null when there isn't a shared currency to compare, or the yearly plan
 * doesn't actually come out cheaper per month in any of them.
 */
export function yearlySavingsPercent(plans: PaymentPlanInfo[]): number | null {
  const monthly = plans.find((p) => p.plan === 'monthly');
  const yearly = plans.find((p) => p.plan === 'yearly');
  if (!monthly || !yearly) return null;

  const percents: number[] = [];
  for (const currency of Object.keys(PRICE_FIELD) as Currency[]) {
    const field = PRICE_FIELD[currency];
    const monthlyRaw = monthly[field];
    const yearlyRaw = yearly[field];
    if (!monthlyRaw || !yearlyRaw) continue;
    const monthlyPrice = Number(monthlyRaw);
    const yearlyPrice = Number(yearlyRaw);
    if (!Number.isFinite(monthlyPrice) || !Number.isFinite(yearlyPrice) || monthlyPrice <= 0) continue;
    percents.push((1 - yearlyPrice / (monthlyPrice * 12)) * 100);
  }
  if (percents.length === 0) return null;
  const smallest = Math.min(...percents);
  return smallest > 0 ? smallest : null;
}

export async function createCheckout(plan: Plan, currency: Currency, email: string): Promise<{ paymentUrl: string }> {
  return postJson('/api/payments/checkout', { plan, currency, email });
}

/** Drives the CheckoutScreen stepper's final "Оплатить" step — redirects to Lava.top's payment page on success. */
export function useCheckout() {
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function subscribe(plan: Plan, currency: Currency, email: string) {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const { paymentUrl } = await createCheckout(plan, currency, email);
      window.location.href = paymentUrl;
    } catch {
      setCheckoutError('Не удалось начать оплату. Попробуйте позже.');
      setCheckingOut(false);
    }
  }

  return { checkingOut, checkoutError, subscribe };
}

export interface PaymentStatus {
  premiumUntil: string | null;
  isPremium: boolean;
}

export async function fetchPaymentStatus(): Promise<PaymentStatus> {
  return getJson('/api/payments/status');
}
