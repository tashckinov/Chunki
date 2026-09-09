import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('./webauthn.js', () => ({
  buildRegistrationOptions: vi.fn(),
  verifyRegistration: vi.fn(),
  buildAuthenticationOptions: vi.fn(),
  verifyAuthentication: vi.fn(),
}));
vi.mock('./webauthnCredentials.js', () => ({
  findCredentialByCredentialId: vi.fn(),
}));
vi.mock('./service.js', () => ({
  completeWebauthnRegistration: vi.fn(),
  completeWebauthnLogin: vi.fn(),
}));

const webauthn = await import('./webauthn.js');
const credentials = await import('./webauthnCredentials.js');
const service = await import('./service.js');
const { webauthnRoutes } = await import('./webauthnRoutes.js');

const CHALLENGE_COOKIE_NAME = 'chunki_webauthn_challenge';

const loginResult = {
  token: 'a-session-token',
  expiresAt: new Date('2030-01-01T00:00:00Z'),
  user: { id: 'user-1', email: null, displayName: null, imageUrl: null, isAdmin: false },
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(webauthn.buildRegistrationOptions).mockReset();
  vi.mocked(webauthn.verifyRegistration).mockReset();
  vi.mocked(webauthn.buildAuthenticationOptions).mockReset();
  vi.mocked(webauthn.verifyAuthentication).mockReset();
  vi.mocked(credentials.findCredentialByCredentialId).mockReset();
  vi.mocked(service.completeWebauthnRegistration).mockReset();
  vi.mocked(service.completeWebauthnLogin).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(webauthnRoutes, { prefix: '/api/auth' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function extractSetCookies(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw.join(';') : String(raw ?? '');
}

describe('POST /api/auth/webauthn/register/options', () => {
  it('sets a signed challenge cookie carrying the register type', async () => {
    vi.mocked(webauthn.buildRegistrationOptions).mockResolvedValue({ challenge: 'chal-123' } as never);

    const res = await app.inject({ method: 'POST', url: '/api/auth/webauthn/register/options' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ options: { challenge: 'chal-123' } });
    expect(extractSetCookies(res)).toContain(`${CHALLENGE_COOKIE_NAME}=`);
  });
});

describe('POST /api/auth/webauthn/register/verify', () => {
  it('rejects with no_pending_challenge when there is no challenge cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/webauthn/register/verify', payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'no_pending_challenge' });
    expect(webauthn.verifyRegistration).not.toHaveBeenCalled();
  });

  it('rejects and clears the cookie when the challenge cookie carries the wrong type (login, not register)', async () => {
    const optsRes = await app.inject({ method: 'POST', url: '/api/auth/webauthn/login/options' });
    vi.mocked(webauthn.buildAuthenticationOptions).mockResolvedValue({ challenge: 'chal-login' } as never);
    const loginOptsRes = await app.inject({ method: 'POST', url: '/api/auth/webauthn/login/options' });
    const cookieHeader = extractSetCookies(loginOptsRes)
      .split(';')
      .find((part) => part.trim().startsWith(`${CHALLENGE_COOKIE_NAME}=`))!
      .trim();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/webauthn/register/verify',
      headers: { cookie: cookieHeader },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'no_pending_challenge' });
    expect(extractSetCookies(res)).toContain(`${CHALLENGE_COOKIE_NAME}=;`);
    void optsRes;
  });

  it('rejects when verification fails, without creating a session', async () => {
    vi.mocked(webauthn.buildRegistrationOptions).mockResolvedValue({ challenge: 'chal-abc' } as never);
    const optsRes = await app.inject({ method: 'POST', url: '/api/auth/webauthn/register/options' });
    const cookieHeader = extractSetCookies(optsRes)
      .split(';')
      .find((part) => part.trim().startsWith(`${CHALLENGE_COOKIE_NAME}=`))!
      .trim();

    vi.mocked(webauthn.verifyRegistration).mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/webauthn/register/verify',
      headers: { cookie: cookieHeader },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'registration_failed' });
    expect(service.completeWebauthnRegistration).not.toHaveBeenCalled();
    expect(extractSetCookies(res)).toContain(`${CHALLENGE_COOKIE_NAME}=;`);
  });

  it('on success, creates the session, sets the session cookie, and clears the challenge cookie', async () => {
    vi.mocked(webauthn.buildRegistrationOptions).mockResolvedValue({ challenge: 'chal-xyz' } as never);
    const optsRes = await app.inject({ method: 'POST', url: '/api/auth/webauthn/register/options' });
    const cookieHeader = extractSetCookies(optsRes)
      .split(';')
      .find((part) => part.trim().startsWith(`${CHALLENGE_COOKIE_NAME}=`))!
      .trim();

    const verified = { credentialId: 'cred-1', publicKey: new Uint8Array(), counter: 0, transports: null, deviceType: 'singleDevice', backedUp: false };
    vi.mocked(webauthn.verifyRegistration).mockResolvedValue(verified);
    vi.mocked(service.completeWebauthnRegistration).mockResolvedValue(loginResult);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/webauthn/register/verify',
      headers: { cookie: cookieHeader },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ token: loginResult.token, user: loginResult.user });
    expect(webauthn.verifyRegistration).toHaveBeenCalledWith({}, 'chal-xyz');
    expect(service.completeWebauthnRegistration).toHaveBeenCalledWith(verified);
    const setCookies = extractSetCookies(res);
    expect(setCookies).toContain('chunki_session=');
    expect(setCookies).toContain(`${CHALLENGE_COOKIE_NAME}=;`);
  });
});

describe('POST /api/auth/webauthn/login/verify', () => {
  it('rejects with unknown_credential when no stored credential matches', async () => {
    vi.mocked(webauthn.buildAuthenticationOptions).mockResolvedValue({ challenge: 'chal-login-1' } as never);
    const optsRes = await app.inject({ method: 'POST', url: '/api/auth/webauthn/login/options' });
    const cookieHeader = extractSetCookies(optsRes)
      .split(';')
      .find((part) => part.trim().startsWith(`${CHALLENGE_COOKIE_NAME}=`))!
      .trim();

    vi.mocked(credentials.findCredentialByCredentialId).mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/webauthn/login/verify',
      headers: { cookie: cookieHeader },
      payload: { id: 'unknown-cred-id' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unknown_credential' });
    expect(webauthn.verifyAuthentication).not.toHaveBeenCalled();
  });

  it('on success, updates the counter, creates a session, and returns the same user shape as /me', async () => {
    vi.mocked(webauthn.buildAuthenticationOptions).mockResolvedValue({ challenge: 'chal-login-2' } as never);
    const optsRes = await app.inject({ method: 'POST', url: '/api/auth/webauthn/login/options' });
    const cookieHeader = extractSetCookies(optsRes)
      .split(';')
      .find((part) => part.trim().startsWith(`${CHALLENGE_COOKIE_NAME}=`))!
      .trim();

    const stored = { credentialId: 'cred-2', userId: 'user-2', publicKey: new Uint8Array(), counter: 3 };
    vi.mocked(credentials.findCredentialByCredentialId).mockResolvedValue(stored);
    vi.mocked(webauthn.verifyAuthentication).mockResolvedValue({ newCounter: 4 });
    vi.mocked(service.completeWebauthnLogin).mockResolvedValue(loginResult);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/webauthn/login/verify',
      headers: { cookie: cookieHeader },
      payload: { id: 'cred-2' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ token: loginResult.token, user: loginResult.user });
    expect(service.completeWebauthnLogin).toHaveBeenCalledWith('user-2', 'cred-2', 4);
  });
});
