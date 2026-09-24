/**
 * Thin fetch-based client for Lava.top's Public API (gate.lava.top).
 *
 * The exact shapes below are reconstructed from third-party open-source SDKs
 * (npm `lava-top-sdk` types, `azamatjamaliev/lava_public_api_sdk_node`) —
 * Lava.top's own docs were unreachable from the environment this was written
 * in. Everything endpoint/field-specific to Lava.top lives in this one file
 * on purpose: if the real API turns out to name something slightly
 * differently, this is the only place that needs fixing.
 */

export type LavaTopCurrency = 'RUB' | 'USD' | 'EUR';
export type LavaTopPeriodicity = 'ONE_TIME' | 'MONTHLY' | 'PERIOD_90_DAYS' | 'PERIOD_180_DAYS' | 'PERIOD_YEAR';

export interface CreateInvoiceParams {
  email: string;
  offerId: string;
  currency: LavaTopCurrency;
  periodicity: LavaTopPeriodicity;
}

export interface LavaTopInvoice {
  id: string;
  status: string;
  paymentUrl: string;
}

export class LavaTopClient {
  #apiKey: string;
  #baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.#apiKey = apiKey;
    this.#baseUrl = baseUrl.replace(/\/$/, '');
  }

  #headers(): Record<string, string> {
    return { 'X-Api-Key': this.#apiKey, 'Content-Type': 'application/json' };
  }

  async createInvoice(params: CreateInvoiceParams): Promise<LavaTopInvoice> {
    const res = await fetch(`${this.#baseUrl}/api/v2/invoice`, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(`Lava.top createInvoice failed: ${res.status} ${res.statusText} — ${await res.text().catch(() => '')}`);
    }
    return (await res.json()) as LavaTopInvoice;
  }

  async getInvoice(id: string): Promise<LavaTopInvoice> {
    const res = await fetch(`${this.#baseUrl}/api/v1/invoices/${encodeURIComponent(id)}`, {
      headers: this.#headers(),
    });
    if (!res.ok) {
      throw new Error(`Lava.top getInvoice failed: ${res.status} ${res.statusText} — ${await res.text().catch(() => '')}`);
    }
    return (await res.json()) as LavaTopInvoice;
  }
}
