import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

const TEST_UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chunki-uploads-test-'));

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js');
  return { SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME, extractSessionToken: actual.extractSessionToken, getSession: vi.fn() };
});
vi.mock('../../config/uploads.js', () => ({ UPLOADS_DIR: TEST_UPLOADS_DIR }));
vi.mock('./service.js', () => ({
  listUsers: vi.fn(),
  setUserPremiumUntil: vi.fn(),
  resetProductionChecks: vi.fn(),
  listCollectionsAdmin: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  listChunksForCollectionAdmin: vi.fn(),
  createChunkInCollection: vi.fn(),
  updateChunk: vi.fn(),
  deleteChunk: vi.fn(),
  removeChunkFromCollection: vi.fn(),
  listAiCallLogsForAdmin: vi.fn(),
  getDialogueForChunk: vi.fn(),
  saveDialogueForChunk: vi.fn(),
  deleteDialogueForChunk: vi.fn(),
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

afterAll(() => {
  fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
});

function buildMultipartBody(filename: string, contentType: string, content: Buffer): { body: Buffer; boundary: string } {
  const boundary = '----chunkiTestBoundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, boundary };
}

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
    const users = [
      { id: validId, email: 'a@b.com', displayName: null, createdAt: '2026-01-01T00:00:00.000Z', lastLoginAt: '2026-01-01T00:00:00.000Z', isAdmin: false, premiumUntil: null, productionChecksUsed: 0 },
    ];
    vi.mocked(service.listUsers).mockResolvedValue(users);

    const res = await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ users });
  });
});

describe('PATCH /api/admin/users/:id', () => {
  it('sets premiumUntil and returns the updated user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const updated = {
      id: validId,
      email: 'a@b.com',
      displayName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: '2026-01-01T00:00:00.000Z',
      isAdmin: false,
      premiumUntil: '2026-02-01T00:00:00.000Z',
      productionChecksUsed: 0,
    };
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
    vi.mocked(service.setUserPremiumUntil).mockResolvedValue({
      kind: 'ok',
      user: { id: validId, email: null, displayName: null, createdAt: '', lastLoginAt: '', isAdmin: false, premiumUntil: null, productionChecksUsed: 0 },
    });

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

describe('POST /api/admin/users/:id/reset-production-checks', () => {
  it('resets the counter and returns the updated user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const updated = {
      id: validId,
      email: 'a@b.com',
      displayName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: '2026-01-01T00:00:00.000Z',
      isAdmin: false,
      premiumUntil: null,
      productionChecksUsed: 0,
    };
    vi.mocked(service.resetProductionChecks).mockResolvedValue({ kind: 'ok', user: updated });

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${validId}/reset-production-checks`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: updated });
    expect(service.resetProductionChecks).toHaveBeenCalledWith(validId);
  });

  it('returns 404 for an unknown user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.resetProductionChecks).mockResolvedValue({ kind: 'not_found' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${validId}/reset-production-checks`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });
});

describe('collections CRUD', () => {
  it('GET /api/admin/collections returns all collections including unpublished', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const collections = [{ id: validId, slug: 'x', title: 'X', description: null, level: 'A1', position: 0, isPublished: false, bannerUrl: null, chunkCount: 0 }];
    vi.mocked(service.listCollectionsAdmin).mockResolvedValue(collections);

    const res = await app.inject({ method: 'GET', url: '/api/admin/collections', cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ collections });
  });

  it('POST /api/admin/collections creates a collection', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const created = { id: validId, slug: 'new-deck', title: 'New Deck', description: null, level: 'A1', position: 0, isPublished: false, bannerUrl: null, chunkCount: 0 };
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
    const updated = { id: validId, slug: 'x', title: 'Renamed', description: null, level: 'A1', position: 0, isPublished: true, bannerUrl: null, chunkCount: 2 };
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

// A real (not just signature-only) 1x1 transparent PNG — needed because the
// route now actually decodes the upload (to resize it), so a truncated/fake
// image no longer makes it past the sharp() step.
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

describe('POST /api/admin/uploads/banner', () => {
  it('resizes+re-encodes the uploaded image to JPEG and returns its URL', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const { body, boundary } = buildMultipartBody('banner.png', 'image/png', TINY_PNG);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/uploads/banner',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const { url } = res.json();
    expect(url).toMatch(/^\/uploads\/banners\/[0-9a-f-]+\.jpg$/);
    const saved = fs.readFileSync(path.join(TEST_UPLOADS_DIR, url.replace('/uploads/', '')));
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG magic bytes — confirms it was actually re-encoded, not just copied
  });

  it('rejects an unsupported file type', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const { body, boundary } = buildMultipartBody('banner.gif', 'image/gif', Buffer.from([0x47, 0x49, 0x46]));

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/uploads/banner',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_file_type' });
  });

  it('returns 403 for a non-admin user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(nonAdminSession);
    const { body, boundary } = buildMultipartBody('banner.png', 'image/png', Buffer.from([0x89, 0x50]));

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/uploads/banner',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('chunks CRUD', () => {
  it('GET /api/admin/collections/:id/chunks lists chunks in position order', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const chunks = [{ id: validId, text: 'sounds good', translation: 'звучит хорошо', explanation: null, level: 'A2', situationPrompts: [], sentences: [], hasDialogue: false, position: 0 }];
    vi.mocked(service.listChunksForCollectionAdmin).mockResolvedValue(chunks);

    const res = await app.inject({ method: 'GET', url: `/api/admin/collections/${validId}/chunks`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ chunks });
  });

  it('POST /api/admin/collections/:id/chunks creates a chunk in the collection', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const created = { id: validId, text: 'take your time', translation: 'не торопись', explanation: null, level: 'A2', situationPrompts: [], sentences: [], hasDialogue: false, position: 3 };
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
    const updated = { id: validId, text: 'sounds good', translation: 'звучит здорово', explanation: null, level: 'A2', situationPrompts: [], sentences: [], hasDialogue: false };
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

describe('GET /api/admin/ai-logs', () => {
  it('returns the logs with the default limit', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const logs = [
      {
        id: validId,
        createdAt: '2026-01-01T00:00:00.000Z',
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        userEmail: 'person@example.com',
        chunkText: 'sounds good',
        request: { situationPrompt: 'x', userAnswer: 'y' },
        response: { verdict: 'chunk_used', feedback: 'Отлично!' },
        error: null,
        durationMs: 842,
      },
    ];
    vi.mocked(service.listAiCallLogsForAdmin).mockResolvedValue(logs);

    const res = await app.inject({ method: 'GET', url: '/api/admin/ai-logs', cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ logs });
    expect(service.listAiCallLogsForAdmin).toHaveBeenCalledWith(100);
  });

  it('respects an explicit limit query param', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.listAiCallLogsForAdmin).mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/admin/ai-logs?limit=25', cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(service.listAiCallLogsForAdmin).toHaveBeenCalledWith(25);
  });

  it('rejects a limit above the max', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);

    const res = await app.inject({ method: 'GET', url: '/api/admin/ai-logs?limit=5000', cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(400);
    expect(service.listAiCallLogsForAdmin).not.toHaveBeenCalled();
  });
});

describe('chunk dialogue', () => {
  const characterId = '33333333-3333-4333-8333-333333333333';
  const imageId = '44444444-4444-4444-8444-444444444444';

  it('GET /api/admin/chunks/:id/dialogue returns null when none exists', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.getDialogueForChunk).mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/api/admin/chunks/${validId}/dialogue`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ dialogue: null });
  });

  it('POST /api/admin/chunks/:id/dialogue saves (upserts) the dialogue', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const dialogue = {
      participants: [{ characterId, side: 'left' as const }],
      messages: [{ characterId, characterImageId: imageId, text: 'Sounds good!' }],
    };
    vi.mocked(service.saveDialogueForChunk).mockResolvedValue({ kind: 'ok', dialogue });

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/chunks/${validId}/dialogue`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: dialogue,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ dialogue });
    expect(service.saveDialogueForChunk).toHaveBeenCalledWith(validId, dialogue);
  });

  it('POST /api/admin/chunks/:id/dialogue rejects a message from a character not in participants', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/chunks/${validId}/dialogue`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { participants: [], messages: [{ characterId, characterImageId: imageId, text: 'x' }] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_request' });
    expect(service.saveDialogueForChunk).not.toHaveBeenCalled();
  });

  it('POST /api/admin/chunks/:id/dialogue surfaces a service-level invalid_reference as 400', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.saveDialogueForChunk).mockResolvedValue({ kind: 'invalid_reference' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/chunks/${validId}/dialogue`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { participants: [{ characterId, side: 'left' }], messages: [{ characterId, characterImageId: imageId, text: 'x' }] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_reference' });
  });

  it('DELETE /api/admin/chunks/:id/dialogue deletes it', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteDialogueForChunk).mockResolvedValue(true);

    const res = await app.inject({ method: 'DELETE', url: `/api/admin/chunks/${validId}/dialogue`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('DELETE /api/admin/chunks/:id/dialogue returns 404 when none exists', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteDialogueForChunk).mockResolvedValue(false);

    const res = await app.inject({ method: 'DELETE', url: `/api/admin/chunks/${validId}/dialogue`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(404);
  });
});
