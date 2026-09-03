import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js');
  return { SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME, getSession: vi.fn() };
});
vi.mock('./service.js', () => ({ getChunkById: vi.fn() }));

const session = await import('../auth/session.js');
const service = await import('./service.js');
const { chunksRoutes } = await import('./routes.js');

const authenticatedSession = {
  userId: 'user-1',
  email: 'person@example.com',
  displayName: 'Person',
  providerImageUrl: null,
};

const validId = '11111111-1111-4111-8111-111111111111';

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(session.getSession).mockReset();
  vi.mocked(service.getChunkById).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(chunksRoutes, { prefix: '/api/chunks' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/chunks/:id', () => {
  it('returns 401 in the project error shape when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/chunks/${validId}` });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
    expect(service.getChunkById).not.toHaveBeenCalled();
  });

  it('returns the chunk for an authenticated session', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const chunk = {
      id: validId,
      text: 'sounds good',
      translation: 'звучит хорошо',
      explanation: null,
      example: null,
      exampleTranslation: null,
      level: 'A2',
    };
    vi.mocked(service.getChunkById).mockResolvedValue(chunk);

    const res = await app.inject({
      method: 'GET',
      url: `/api/chunks/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ chunk });
    expect(service.getChunkById).toHaveBeenCalledWith(validId);
  });

  it('returns the standard 404 shape for an unknown id', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.getChunkById).mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/api/chunks/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('returns 404 (not a raw database error) for a malformed id, without querying the service', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);

    const res = await app.inject({
      method: 'GET',
      url: '/api/chunks/not-a-uuid',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    expect(service.getChunkById).not.toHaveBeenCalled();
  });
});
