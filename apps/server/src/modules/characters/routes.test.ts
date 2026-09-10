import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

const TEST_UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chunki-characters-test-'));

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js');
  return { SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME, extractSessionToken: actual.extractSessionToken, getSession: vi.fn() };
});
vi.mock('../../config/uploads.js', () => ({ UPLOADS_DIR: TEST_UPLOADS_DIR }));
vi.mock('./service.js', () => ({
  listCharacters: vi.fn(),
  findCharacter: vi.fn(),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  addCharacterImage: vi.fn(),
  updateCharacterImage: vi.fn(),
  reorderCharacterImages: vi.fn(),
  deleteCharacterImage: vi.fn(),
  findChunksUsingCharacter: vi.fn(),
}));

const session = await import('../auth/session.js');
const service = await import('./service.js');
const { charactersRoutes } = await import('./routes.js');

const adminSession = { userId: 'admin-1', email: 'admin@example.com', displayName: 'Admin', providerImageUrl: null, isAdmin: true };
const nonAdminSession = { userId: 'user-1', email: 'person@example.com', displayName: 'Person', providerImageUrl: null, isAdmin: false };

const validId = '11111111-1111-4111-8111-111111111111';
const imageId = '33333333-3333-4333-8333-333333333333';

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(session.getSession).mockReset();
  for (const fn of Object.values(service)) vi.mocked(fn).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(charactersRoutes, { prefix: '/api/admin/characters' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

afterAll(() => {
  fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
});

// A real (not just signature-only) 1x1 transparent PNG — needed because the
// upload routes actually decode the image (to resize it) via sharp.
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const BOUNDARY = '----chunkiTestBoundary';

function fieldPart(name: string, value: string): string {
  return `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
}

function filePart(fieldName: string, filename: string, contentType: string, content: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    content,
    Buffer.from('\r\n'),
  ]);
}

function buildMultipartBody(parts: (string | Buffer)[]): Buffer {
  return Buffer.concat([...parts.map((p) => (typeof p === 'string' ? Buffer.from(p) : p)), Buffer.from(`--${BOUNDARY}--\r\n`)]);
}

describe('characters routes auth', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/characters' });
    expect(res.statusCode).toBe(401);
    expect(service.listCharacters).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin', async () => {
    vi.mocked(session.getSession).mockResolvedValue(nonAdminSession);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/characters',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(service.listCharacters).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/characters', () => {
  it('returns the character list', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const characters = [{ id: validId, name: 'Mia', fullBodyImageUrl: null, position: 0, images: [] }];
    vi.mocked(service.listCharacters).mockResolvedValue(characters);

    const res = await app.inject({ method: 'GET', url: '/api/admin/characters', cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ characters });
  });
});

describe('POST /api/admin/characters', () => {
  it('creates a character', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const created = { id: validId, name: 'Mia', fullBodyImageUrl: null, position: 0, images: [] };
    vi.mocked(service.createCharacter).mockResolvedValue(created);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/characters',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { name: 'Mia' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ character: created });
    expect(service.createCharacter).toHaveBeenCalledWith('Mia');
  });

  it('rejects an empty name', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/characters',
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { name: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(service.createCharacter).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/characters/:id', () => {
  it('renames a character', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const updated = { id: validId, name: 'Mia (renamed)', fullBodyImageUrl: null, position: 0, images: [] };
    vi.mocked(service.updateCharacter).mockResolvedValue({ kind: 'ok', character: updated });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/characters/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { name: 'Mia (renamed)' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ character: updated });
  });

  it('returns 404 for an unknown character', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.updateCharacter).mockResolvedValue({ kind: 'not_found' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/characters/${validId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { name: 'X' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/admin/characters/:id', () => {
  it('deletes a character', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteCharacter).mockResolvedValue(true);

    const res = await app.inject({ method: 'DELETE', url: `/api/admin/characters/${validId}`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 404 for an unknown character', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteCharacter).mockResolvedValue(false);

    const res = await app.inject({ method: 'DELETE', url: `/api/admin/characters/${validId}`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/admin/characters/:id/chunks', () => {
  it('returns the chunks whose dialogue uses this character', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const chunks = [{ chunkId: validId, chunkText: 'sounds good', chunkTranslation: 'звучит хорошо', collectionTitles: ['Travel Basics'] }];
    vi.mocked(service.findChunksUsingCharacter).mockResolvedValue(chunks);

    const res = await app.inject({ method: 'GET', url: `/api/admin/characters/${validId}/chunks`, cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ chunks });
    expect(service.findChunksUsingCharacter).toHaveBeenCalledWith(validId);
  });
});

describe('POST /api/admin/characters/:id/full-body-image', () => {
  it('resizes+re-encodes a transparent upload as PNG to preserve alpha', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const updated = { id: validId, name: 'Mia', fullBodyImageUrl: '/uploads/characters/whatever.png', position: 0, images: [] };
    vi.mocked(service.updateCharacter).mockResolvedValue({ kind: 'ok', character: updated });

    const body = buildMultipartBody([filePart('file', 'mia.png', 'image/png', TINY_PNG)]);
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/characters/${validId}/full-body-image`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ character: updated });
    const [, patch] = vi.mocked(service.updateCharacter).mock.calls[0];
    expect(patch.fullBodyImageUrl).toMatch(/^\/uploads\/characters\/[0-9a-f-]+\.png$/);
    const saved = fs.readFileSync(path.join(TEST_UPLOADS_DIR, patch.fullBodyImageUrl!.replace('/uploads/', '')));
    expect(saved.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('rejects an unsupported file type', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const body = buildMultipartBody([filePart('file', 'mia.gif', 'image/gif', Buffer.from([0x47, 0x49, 0x46]))]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/characters/${validId}/full-body-image`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_file_type' });
  });
});

describe('POST /api/admin/characters/:id/images', () => {
  it('uploads multiple files under one shared emotion and creates one image row each', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.addCharacterImage)
      .mockResolvedValueOnce({ id: 'img-1', emotion: 'happy', imageUrl: '/uploads/characters/a.jpg', description: null, position: 0 })
      .mockResolvedValueOnce({ id: 'img-2', emotion: 'happy', imageUrl: '/uploads/characters/b.jpg', description: null, position: 1 });

    const body = buildMultipartBody([
      fieldPart('emotion', 'happy'),
      filePart('file', 'a.png', 'image/png', TINY_PNG),
      filePart('file', 'b.png', 'image/png', TINY_PNG),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/characters/${validId}/images`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().images).toHaveLength(2);
    expect(service.addCharacterImage).toHaveBeenCalledTimes(2);
    expect(service.addCharacterImage).toHaveBeenCalledWith(validId, expect.objectContaining({ emotion: 'happy' }));
  });

  it('rejects a batch with no emotion field', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const body = buildMultipartBody([filePart('file', 'a.png', 'image/png', TINY_PNG)]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/characters/${validId}/images`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(service.addCharacterImage).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/characters/:id/images/:imageId', () => {
  it('moves an image to a different emotion', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const moved = { id: imageId, emotion: 'confused', imageUrl: '/uploads/characters/a.jpg', description: null, position: 2 };
    vi.mocked(service.updateCharacterImage).mockResolvedValue(moved);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/characters/${validId}/images/${imageId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { emotion: 'confused' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ image: moved });
    expect(service.updateCharacterImage).toHaveBeenCalledWith(imageId, { emotion: 'confused' });
  });

  it('sets a description without requiring emotion', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    const updated = { id: imageId, emotion: 'happy', imageUrl: '/uploads/characters/a.jpg', description: 'good', position: 0 };
    vi.mocked(service.updateCharacterImage).mockResolvedValue(updated);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/characters/${validId}/images/${imageId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { description: 'good' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ image: updated });
    expect(service.updateCharacterImage).toHaveBeenCalledWith(imageId, { description: 'good' });
  });

  it('rejects a patch with neither emotion nor description', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/characters/${validId}/images/${imageId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(service.updateCharacterImage).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown image', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.updateCharacterImage).mockResolvedValue(null);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/characters/${validId}/images/${imageId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { emotion: 'confused' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/admin/characters/:id/images/reorder', () => {
  it('persists the new order', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.reorderCharacterImages).mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/characters/${validId}/images/reorder`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
      payload: { emotion: 'happy', imageIds: [imageId, validId] },
    });

    expect(res.statusCode).toBe(200);
    expect(service.reorderCharacterImages).toHaveBeenCalledWith(validId, 'happy', [imageId, validId]);
  });
});

describe('DELETE /api/admin/characters/:id/images/:imageId', () => {
  it('deletes an unused image', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteCharacterImage).mockResolvedValue('ok');

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/characters/${validId}/images/${imageId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 409 when the image is used by a dialogue message', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteCharacterImage).mockResolvedValue('in_use');

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/characters/${validId}/images/${imageId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'image_in_use' });
  });

  it('returns 404 for an unknown image', async () => {
    vi.mocked(session.getSession).mockResolvedValue(adminSession);
    vi.mocked(service.deleteCharacterImage).mockResolvedValue('not_found');

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/characters/${validId}/images/${imageId}`,
      cookies: { [session.SESSION_COOKIE_NAME]: 'a-valid-token' },
    });

    expect(res.statusCode).toBe(404);
  });
});
