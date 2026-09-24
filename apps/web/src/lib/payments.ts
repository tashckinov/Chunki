import { getJson, postJson } from './collections';

export type Plan = 'monthly' | 'yearly';

export async function createCheckout(plan: Plan): Promise<{ paymentUrl: string }> {
  return postJson('/api/payments/checkout', { plan });
}

export interface PaymentStatus {
  premiumUntil: string | null;
  isPremium: boolean;
}

export async function fetchPaymentStatus(): Promise<PaymentStatus> {
  return getJson('/api/payments/status');
}
