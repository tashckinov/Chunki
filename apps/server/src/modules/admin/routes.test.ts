import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js');
  return { SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME, extractSessionToken: actual.extractSessionToken, getSession: vi.fn() };
});
vi.mock('./service.js', () => ({
  listUsers: vi.fn(),
  setUserPremiumUntil: vi.fn(),
  listCollectionsAdmin: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  listChunksForCollectionAdmin: vi.fn(),
  createChunkInCollection: vi.fn(),
  updateChunk: vi.fn(),
  deleteChunk: vi.fn(),
  removeChunkFromCollection: vi.fn(),
}));

const session = await import('../auth/session.js');
const service = await import('./service.js');
const { adminRoutes } = await import('./routes.js');

const adminSession = { userId: 'admin-1', email: 'admin@example.com', displayName: 'Admin', providerImageUrl: null, isAdmin: true };
const nonAdminSession = { userId: 'user-1', email: 'person@example.com', displayName: 'Person', providerImageUrl: null, isAdmin: false };

const validId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(session.getSession).mockReset();
  for (const fn of Object.values(service)) vi.mocked(fn).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('admin routes auth', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
    expect(service.listUsers).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin', async () => {
    vi.mocked(session.getSession).mockResolvedValue(nonAdminSession);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect(service.listUsers).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/users', () => {
  it('returns the user list for an admin', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const users = [{ id: validId, email: 'a@b.com', displayName: null, createdAt: '2026-01-01T00:00:00.000Z', lastLoginAt: '2026-01-01T00:00:00.000Z', isAdmin: false, premiumUntil: null }];
    vi.mocked(service.listUsers).mockResolvedValue(users);

    const res = await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ users });
  });
});

describe('PATCH /api/admin/users/:id', () => {
  it('sets premiumUntil and returns the updated user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const updated = { id: validId, email: 'a@b.com', displayName: null, createdAt: '2026-01-01T00:00:00.000Z', lastLoginAt: '2026-01-01T00:00:00.000Z', isAdmin: false, premiumUntil: '2026-02-01T00:00:00.000Z' };
    vi.mocked(service.setUserPremiumUntil).mockResolvedValue({ kind: 'ok', user: updated });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { premiumUntil: '2026-02-01T00:00:00.000Z' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: updated });
    expect(service.setUserPremiumUntil).toHaveBeenCalledWith(validId, new Date('2026-02-01T00:00:00.000Z'));
  });

  it('accepts null to revoke a subscription', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.setUserPremiumUntil).mockResolvedValue({ kind: 'ok', user: { id: validId, email: null, displayName: null, createdAt: '', lastLoginAt: '', isAdmin: false, premiumUntil: null } });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { premiumUntil: null },
    });

    expect(res.statusCode).toBe(200);
    expect(service.setUserPremiumUntil).toHaveBeenCalledWith(validId, null);
  });

  it('returns 404 for an unknown user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.setUserPremiumUntil).mockResolvedValue({ kind: 'not_found' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { premiumUntil: null },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 for a malformed body', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { premiumUntil: 'not-a-date' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_request' });
    expect(service.setUserPremiumUntil).not.toHaveBeenCalled();
  });
});

describe('collections CRUD', () => {
  it('GET /api/admin/collections returns all collections including unpublished', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const collections = [{ id: validId, slug: 'x', title: 'X', description: null, level: 'A1', position: 0, isPublished: false, chunkCount: 0 }];
    vi.mocked(service.listCollectionsAdmin).mockResolvedValue(collections);

    const res = await app.inject({ method: 'GET', url: '/api/admin/collections', cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ collections });
  });

  it('POST /api/admin/collections creates a collection', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const created = { id: validId, slug: 'new-deck', title: 'New Deck', description: null, level: 'A1', position: 0, isPublished: false, chunkCount: 0 };
    vi.mocked(service.createCollection).mockResolvedValue(created);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/collections',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { slug: 'new-deck', title: 'New Deck', level: 'A1' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ collection: created });
  });

  it('POST /api/admin/collections rejects an invalid slug', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/collections',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { slug: 'Not A Slug', title: 'X', level: 'A1' },
    });

    expect(res.statusCode).toBe(400);
    expect(service.createCollection).not.toHaveBeenCalled();
  });

  it('PATCH /api/admin/collections/:id updates a collection', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const updated = { id: validId, slug: 'x', title: 'Renamed', description: null, level: 'A1', position: 0, isPublished: true, chunkCount: 2 };
    vi.mocked(service.updateCollection).mockResolvedValue({ kind: 'ok', collection: updated });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/collections/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { title: 'Renamed', isPublished: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ collection: updated });
  });

  it('PATCH /api/admin/collections/:id returns 404 for an unknown collection', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.updateCollection).mockResolvedValue({ kind: 'not_found' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/collections/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { title: 'X' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('chunks CRUD', () => {
  it('GET /api/admin/collections/:id/chunks lists chunks in position order', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const chunks = [{ id: validId, text: 'sounds good', translation: 'звучит хорошо', explanation: null, example: null, exampleTranslation: null, level: 'A2', situationPrompt: null, position: 0 }];
    vi.mocked(service.listChunksForCollectionAdmin).mockResolvedValue(chunks);

    const res = await app.inject({ method: 'GET', url: `/api/admin/collections/${validId}/chunks`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ chunks });
  });

  it('POST /api/admin/collections/:id/chunks creates a chunk in the collection', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const created = { id: validId, text: 'take your time', translation: 'не торопись', explanation: null, example: null, exampleTranslation: null, level: 'A2', situationPrompt: null, position: 3 };
    vi.mocked(service.createChunkInCollection).mockResolvedValue(created);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/collections/${validId}/chunks`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { text: 'take your time', translation: 'не торопись', level: 'A2' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ chunk: created });
    expect(service.createChunkInCollection).toHaveBeenCalledWith(
      validId,
      expect.objectContaining({ text: 'take your time', translation: 'не торопись', level: 'A2' }),
    );
  });

  it('PATCH /api/admin/chunks/:id updates a chunk', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const updated = { id: validId, text: 'sounds good', translation: 'звучит здорово', explanation: null, example: null, exampleTranslation: null, level: 'A2', situationPrompt: null };
    vi.mocked(service.updateChunk).mockResolvedValue({ kind: 'ok', chunk: updated });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/chunks/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { translation: 'звучит здорово' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ chunk: updated });
  });

  it('PATCH /api/admin/chunks/:id returns 404 for an unknown chunk', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.updateChunk).mockResolvedValue({ kind: 'not_found' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/chunks/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { translation: 'x' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/admin/chunks/:id deletes a chunk', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteChunk).mockResolvedValue(true);

    const res = await app.inject({ method: 'DELETE', url: `/api/admin/chunks/${validId}`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('DELETE /api/admin/chunks/:id returns 404 for an unknown chunk', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteChunk).mockResolvedValue(false);

    const res = await app.inject({ method: 'DELETE', url: `/api/admin/chunks/${validId}`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/admin/collections/:id/chunks/:chunkId detaches without deleting the chunk', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.removeChunkFromCollection).mockResolvedValue(true);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/collections/${validId}/chunks/${otherId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(service.removeChunkFromCollection).toHaveBeenCalledWith(validId, otherId);
    expect(service.deleteChunk).not.toHaveBeenCalled();
  });
});
