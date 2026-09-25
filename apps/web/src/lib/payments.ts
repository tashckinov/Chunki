import { useState } from 'react';
import { ApiError, getJson, postJson } from './collections';

export type Plan = 'monthly' | 'yearly';

export async function createCheckout(plan: Plan): Promise<{ paymentUrl: string }> {
  return postJson('/api/payments/checkout', { plan });
}

/** Shared checkout flow for both PaywallScreen and DeckDoneScreen's upsell — redirects to Lava.top's payment page on success. */
export function useCheckout(plan: Plan) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function subscribe() {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const { paymentUrl } = await createCheckout(plan);
      window.location.href = paymentUrl;
    } catch (err) {
      setCheckoutError(err instanceof ApiError && err.status === 409 ? 'К аккаунту не привязан email — войдите заново через Google.' : 'Не удалось начать оплату. Попробуйте позже.');
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
