import { describe, it, expect, afterEach, vi } from 'vitest';

// Required vars loadEnv() needs regardless of what this file is testing —
// mirrors src/test/setup-env.ts, since resetModules() below forces env.ts
// to re-run its schema validation from scratch on each import.
const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:8787/api/auth/google/callback',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  FRONTEND_URL: 'http://localhost:5173',
};

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

async function loadOfferIdMonthly(value: string | undefined) {
  process.env = { ...originalEnv, ...REQUIRED_ENV };
  if (value === undefined) delete process.env.LAVA_TOP_OFFER_ID_MONTHLY;
  else process.env.LAVA_TOP_OFFER_ID_MONTHLY = value;
  vi.resetModules();
  const { loadEnv } = await import('./env.js');
  return loadEnv().LAVA_TOP_OFFER_ID_MONTHLY;
}

describe('loadEnv — LAVA_TOP_OFFER_ID_* accepts a bare id or Lava.top\'s "copy link"', () => {
  it('leaves a bare offerId untouched', async () => {
    expect(await loadOfferIdMonthly('45b347bb-4063-4175-b018-69df351313a3')).toBe('45b347bb-4063-4175-b018-69df351313a3');
  });

  it('extracts the offerId from a full product link', async () => {
    const link = 'https://app.lava.top/products/224c1c3c-3604-4420-84ab-bad09bd1ebd7/45b347bb-4063-4175-b018-69df351313a3';
    expect(await loadOfferIdMonthly(link)).toBe('45b347bb-4063-4175-b018-69df351313a3');
  });

  it('leaves it unset when omitted entirely', async () => {
    expect(await loadOfferIdMonthly(undefined)).toBeUndefined();
  });

  it('leaves it unset when given an empty string', async () => {
    expect(await loadOfferIdMonthly('')).toBeUndefined();
  });
});
