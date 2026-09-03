import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('./session.js', async () => {
  const actual = await vi.importActual<typeof import('./session.js')>('./session.js');
  return {
    SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME,
    getSession: vi.fn(),
    destroySession: vi.fn(),
    createSession: vi.fn(),
  };
});

const session = await import('./session.js');
const { authRoutes } = await import('./routes.js');

const authenticatedSession = {
  userId: 'user-1',
  email: 'person@example.com',
  displayName: 'Person',
  providerImageUrl: 'https://lh3.googleusercontent.com/verified-pic',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(session.getSession).mockReset();
  vi.mocked(session.destroySession).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/auth/me', () => {
  it('returns 401 in the project error shape when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
    expect(session.getSession).not.toHaveBeenCalled();
  });

  it('returns the authenticated user with the provider image URL', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-opaque-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: {
        id: authenticatedSession.userId,
        email: authenticatedSession.email,
        displayName: authenticatedSession.displayName,
        imageUrl: authenticatedSession.providerImageUrl,
      },
    });
    expect(session.getSession).toHaveBeenCalledWith('a-valid-opaque-token');
  });

  it('ignores a client-supplied imageUrl — the field always comes from the session', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me?imageUrl=https://evil.example/fake.jpg',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-opaque-token' },
    });

    expect(res.json().user.imageUrl).toBe(authenticatedSession.providerImageUrl);
  });

  it('treats a missing/unknown session token as unauthenticated', async () => {
    vi.mocked(session.getSession).mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [session.SESSION_COOKIE_NAME]: 'not-a-real-token' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates the server-side session and clears the cookie', async () => {
    vi.mocked(session.destroySession).mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-opaque-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(session.destroySession).toHaveBeenCalledWith('a-valid-opaque-token');

    const setCookie = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
    expect(cookieHeader).toContain(`${session.SESSION_COOKIE_NAME}=;`);
  });

  it('is a no-op (but still succeeds) when there is no session cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });

    expect(res.statusCode).toBe(200);
    expect(session.destroySession).not.toHaveBeenCalled();
  });
});
