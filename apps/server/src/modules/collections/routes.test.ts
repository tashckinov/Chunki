import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js');
  return { SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME, extractSessionToken: actual.extractSessionToken, getSession: vi.fn() };
});
vi.mock('./service.js', () => ({
  getPublishedCollections: vi.fn(),
  getPublishedCollectionBySlug: vi.fn(),
}));

const session = await import('../auth/session.js');
const service = await import('./service.js');
const { collectionsRoutes } = await import('./routes.js');

const authenticatedSession = {
  userId: 'user-1',
  email: 'person@example.com',
  displayName: 'Person',
  providerImageUrl: null,
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(session.getSession).mockReset();
  vi.mocked(service.getPublishedCollections).mockReset();
  vi.mocked(service.getPublishedCollectionBySlug).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(collectionsRoutes, { prefix: '/api/collections' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/collections', () => {
  it('returns 401 in the project error shape when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/collections' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
    expect(service.getPublishedCollections).not.toHaveBeenCalled();
  });

  it('returns published collections for an authenticated session', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const collections = [{ id: 'col-1', slug: 'travel-basics', title: 'Travel Basics', description: null, level: 'A2' }];
    vi.mocked(service.getPublishedCollections).mockResolvedValue(collections);

    const res = await app.inject({
      method: 'GET',
      url: '/api/collections',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ collections });
  });
});

describe('GET /api/collections/:slug', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/collections/travel-basics' });
    expect(res.statusCode).toBe(401);
    expect(service.getPublishedCollectionBySlug).not.toHaveBeenCalled();
  });

  it('returns the collection with its chunks', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const detail = {
      id: 'col-1',
      slug: 'travel-basics',
      title: 'Travel Basics',
      description: null,
      level: 'A2',
      chunks: [{ id: 'chunk-1', text: 'check in', translation: 'зарегистрироваться', explanation: null, example: null, exampleTranslation: null, level: 'A2' }],
    };
    vi.mocked(service.getPublishedCollectionBySlug).mockResolvedValue(detail);

    const res = await app.inject({
      method: 'GET',
      url: '/api/collections/travel-basics',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ collection: detail });
    expect(service.getPublishedCollectionBySlug).toHaveBeenCalledWith('travel-basics');
  });

  it('returns the standard 404 shape for an unknown slug', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.getPublishedCollectionBySlug).mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/collections/does-not-exist',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('returns 404 (not a raw error) for a malformed slug, without querying the service', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);

    const res = await app.inject({
      method: 'GET',
      url: '/api/collections/Not-A-Valid-Slug',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    expect(service.getPublishedCollectionBySlug).not.toHaveBeenCalled();
  });
});
