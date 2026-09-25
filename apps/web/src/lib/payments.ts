import { useState } from 'react';
import { getJson, postJson } from './collections';

export type Plan = 'monthly' | 'yearly';
export type Currency = 'USD' | 'EUR' | 'RUB';

// Title and prices are admin-managed (payment_plans table, admin "Платежи"
// page) — fetched via fetchPaymentPlans() below. This blurb line is the one
// bit of marketing copy that isn't, since the admin form only asks for
// name/link/prices, not freeform benefit text.
export const PLAN_BLURB: Record<Plan, string> = {
  monthly: 'без обязательств',
  yearly: 'выгоднее на 44%',
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
