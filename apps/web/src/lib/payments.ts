import { useState } from 'react';
import { getJson, postJson } from './collections';

export type Periodicity = 'monthly' | 'yearly';
export type Currency = 'USD' | 'EUR' | 'RUB';

export const CURRENCIES: Record<Currency, { label: string; symbol: string }> = {
  USD: { label: 'Доллары США', symbol: '$' },
  EUR: { label: 'Евро', symbol: '€' },
  RUB: { label: 'Рубли', symbol: '₽' },
};

export interface Tariff {
  id: string;
  name: string;
  periodicity: Periodicity;
  priceUsd: string | null;
  priceEur: string | null;
  priceRub: string | null;
  allowCards: boolean;
  allowProgram: boolean;
  dailyCheckLimit: number | null;
}

/** Public — no auth needed, used by the checkout screen to show real tariff names/prices/entitlements instead of a hardcoded guess. */
export async function fetchTariffs(): Promise<Tariff[]> {
  const data = await getJson<{ tariffs: Tariff[] }>('/api/payments/tariffs');
  return data.tariffs;
}

const PRICE_FIELD: Record<Currency, keyof Tariff> = { USD: 'priceUsd', EUR: 'priceEur', RUB: 'priceRub' };

function tariffPrice(tariff: Tariff, currency: Currency): number | null {
  const raw = tariff[PRICE_FIELD[currency]];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * "Выгоднее на ~X%" for the cheapest yearly tariff vs. 12× the cheapest
 * monthly tariff (the constructor allows any number of tariffs, so this
 * compares the best available option on each periodicity rather than a
 * fixed pair). Computed separately per currency both sides are priced in,
 * then the SMALLEST of those percentages is returned — the most
 * conservative claim, since which currency the learner actually pays in is
 * only decided on the next step (e.g. 20% cheaper in RUB but 90% in EUR
 * shows as ~20%, never ~90%). Null when there's no monthly/yearly pair to
 * compare, no shared currency, or yearly doesn't actually come out cheaper
 * per month in any of them.
 */
export function yearlySavingsPercent(tariffs: Tariff[]): number | null {
  const monthlyTariffs = tariffs.filter((t) => t.periodicity === 'monthly');
  const yearlyTariffs = tariffs.filter((t) => t.periodicity === 'yearly');
  if (monthlyTariffs.length === 0 || yearlyTariffs.length === 0) return null;

  const percents: number[] = [];
  for (const currency of Object.keys(PRICE_FIELD) as Currency[]) {
    const monthlyPrices = monthlyTariffs.map((t) => tariffPrice(t, currency)).filter((n): n is number => n !== null);
    const yearlyPrices = yearlyTariffs.map((t) => tariffPrice(t, currency)).filter((n): n is number => n !== null);
    if (monthlyPrices.length === 0 || yearlyPrices.length === 0) continue;
    const monthlyPrice = Math.min(...monthlyPrices);
    const yearlyPrice = Math.min(...yearlyPrices);
    percents.push((1 - yearlyPrice / (monthlyPrice * 12)) * 100);
  }
  if (percents.length === 0) return null;
  const smallest = Math.min(...percents);
  return smallest > 0 ? smallest : null;
}

export async function createCheckout(tariffId: string, currency: Currency, email: string): Promise<{ paymentUrl: string }> {
  return postJson('/api/payments/checkout', { tariffId, currency, email });
}

/** Drives the checkout screen's final "Оплатить" step — redirects to Lava.top's payment page on success. */
export function useCheckout() {
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function subscribe(tariffId: string, currency: Currency, email: string) {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const { paymentUrl } = await createCheckout(tariffId, currency, email);
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
