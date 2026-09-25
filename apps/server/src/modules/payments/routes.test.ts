import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js');
  return { SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME, extractSessionToken: actual.extractSessionToken, getSession: vi.fn() };
});
vi.mock('./service.js', () => ({
  createCheckoutForUser: vi.fn(),
  getAccountPaymentStatus: vi.fn(),
  handleLavaTopWebhook: vi.fn(),
}));

const session = await import('../auth/session.js');
const service = await import('./service.js');
const { paymentsRoutes } = await import('./routes.js');

const authenticatedSession = { userId: 'user-1', email: 'person@example.com', displayName: 'Person', providerImageUrl: null, isAdmin: false };

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(session.getSession).mockReset();
  vi.mocked(service.createCheckoutForUser).mockReset();
  vi.mocked(service.getAccountPaymentStatus).mockReset();
  vi.mocked(service.handleLavaTopWebhook).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(paymentsRoutes, { prefix: '/api/payments' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const authCookie = { [session.SESSION_COOKIE_NAME]: 'a-valid-token' };

describe('POST /api/payments/checkout', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/payments/checkout', payload: { plan: 'monthly' } });
    expect(res.statusCode).toBe(401);
    expect(service.createCheckoutForUser).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid plan', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      cookies: authCookie,
      payload: { plan: 'weekly', currency: 'USD', email: 'person@example.com' },
    });
    expect(res.statusCode).toBe(400);
    expect(service.createCheckoutForUser).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid currency', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      cookies: authCookie,
      payload: { plan: 'monthly', currency: 'RUB', email: 'person@example.com' },
    });
    expect(res.statusCode).toBe(400);
    expect(service.createCheckoutForUser).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid email', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      cookies: authCookie,
      payload: { plan: 'monthly', currency: 'USD', email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    expect(service.createCheckoutForUser).not.toHaveBeenCalled();
  });

  it('creates a checkout for the authenticated user with the submitted email/currency and returns the payment URL', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.createCheckoutForUser).mockResolvedValue({ kind: 'ok', paymentUrl: 'https://gate.lava.top/pay/abc' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      cookies: authCookie,
      payload: { plan: 'yearly', currency: 'EUR', email: 'chosen@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ paymentUrl: 'https://gate.lava.top/pay/abc' });
    expect(service.createCheckoutForUser).toHaveBeenCalledWith('user-1', 'chosen@example.com', 'yearly', 'EUR');
  });

  it('returns 502 when the payment provider call throws', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.createCheckoutForUser).mockRejectedValue(new Error('provider down'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      cookies: authCookie,
      payload: { plan: 'monthly', currency: 'USD', email: 'person@example.com' },
    });

    expect(res.statusCode).toBe(502);
  });
});

describe('GET /api/payments/status', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/payments/status' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the account payment status for the authenticated user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.getAccountPaymentStatus).mockResolvedValue({ premiumUntil: '2030-01-01T00:00:00.000Z', isPremium: true });

    const res = await app.inject({ method: 'GET', url: '/api/payments/status', cookies: authCookie });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ premiumUntil: '2030-01-01T00:00:00.000Z', isPremium: true });
    expect(service.getAccountPaymentStatus).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /api/payments/webhook/lava-top', () => {
  const basicAuthHeader = `Basic ${Buffer.from('test-webhook-login:test-webhook-password').toString('base64')}`;

  it('returns 401 with no Authorization header', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/payments/webhook/lava-top', payload: { eventType: 'payment.success' } });
    expect(res.statusCode).toBe(401);
    expect(service.handleLavaTopWebhook).not.toHaveBeenCalled();
  });

  it('returns 401 with the wrong credentials', async () => {
    const wrongHeader = `Basic ${Buffer.from('wrong:wrong').toString('base64')}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/lava-top',
      headers: { authorization: wrongHeader },
      payload: { eventType: 'payment.success' },
    });
    expect(res.statusCode).toBe(401);
    expect(service.handleLavaTopWebhook).not.toHaveBeenCalled();
  });

  it('processes the payload when Basic auth matches LAVA_TOP_WEBHOOK_LOGIN/PASSWORD', async () => {
    vi.mocked(service.handleLavaTopWebhook).mockResolvedValue(undefined);
    const payload = { eventType: 'payment.success', contractId: 'contract-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/lava-top',
      headers: { authorization: basicAuthHeader },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(service.handleLavaTopWebhook).toHaveBeenCalledWith(payload);
  });

  it('returns 502 when webhook handling throws, without leaking the error to the caller', async () => {
    vi.mocked(service.handleLavaTopWebhook).mockRejectedValue(new Error('db down'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook/lava-top',
      headers: { authorization: basicAuthHeader },
      payload: { eventType: 'payment.success' },
    });

    expect(res.statusCode).toBe(502);
  });
});
