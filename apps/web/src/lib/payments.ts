import { useState } from 'react';
import { getJson, postJson } from './collections';

export type Plan = 'monthly' | 'yearly';
export type Currency = 'USD' | 'EUR' | 'RUB';

// Real prices live in Lava.top's dashboard, one per plan offer (each priced
// in every currency it supports) — this backend has no API to read them
// back, so the checkout stepper shows only plan names/blurbs here and leaves
// the actual amount to Lava.top's own payment page after redirect, rather
// than guessing at a number that could drift out of sync per currency.
export const PLANS: Record<Plan, { title: string; meta: string }> = {
  monthly: { title: 'Месяц', meta: 'без обязательств' },
  yearly: { title: 'Год', meta: 'выгоднее на 44%' },
};

export const CURRENCIES: Record<Currency, { label: string; symbol: string }> = {
  USD: { label: 'Доллары США', symbol: '$' },
  EUR: { label: 'Евро', symbol: '€' },
  RUB: { label: 'Рубли', symbol: '₽' },
};

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
