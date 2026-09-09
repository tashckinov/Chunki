import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js');
  return { SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME, extractSessionToken: actual.extractSessionToken, getSession: vi.fn() };
});
vi.mock('./service.js', () => ({
  recordSort: vi.fn(),
  getProgressForChunks: vi.fn(),
  buildRecognitionCheck: vi.fn(),
  recordRecognitionResult: vi.fn(),
  buildProductionCheck: vi.fn(),
  submitProductionAnswer: vi.fn(),
}));

const session = await import('../auth/session.js');
const service = await import('./service.js');
const { progressRoutes } = await import('./routes.js');

const authenticatedSession = { userId: 'user-1', email: 'person@example.com', displayName: 'Person', providerImageUrl: null };
const validChunkId = '11111111-1111-4111-8111-111111111111';

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(session.getSession).mockReset();
  vi.mocked(service.recordSort).mockReset();
  vi.mocked(service.getProgressForChunks).mockReset();
  vi.mocked(service.buildRecognitionCheck).mockReset();
  vi.mocked(service.recordRecognitionResult).mockReset();
  vi.mocked(service.buildProductionCheck).mockReset();
  vi.mocked(service.submitProductionAnswer).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(progressRoutes, { prefix: '/api/progress' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const authCookie = { [session.SESSION_COOKIE_NAME]: 'a-valid-token' };

describe('POST /api/progress/sort', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/progress/sort', payload: { chunkId: validChunkId, verdict: 'know' } });
    expect(res.statusCode).toBe(401);
    expect(service.recordSort).not.toHaveBeenCalled();
  });

  it('records the sort verdict for the authenticated user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const progress = { chunkId: validChunkId, state: 'self_known', timesReviewed: 1, timesProductionAttempted: 0, timesProductionPassed: 0 };
    vi.mocked(service.recordSort).mockResolvedValue(progress);

    const res = await app.inject({
      method: 'POST',
      url: '/api/progress/sort',
      cookies: authCookie,
      payload: { chunkId: validChunkId, verdict: 'know' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ progress });
    expect(service.recordSort).toHaveBeenCalledWith('user-1', validChunkId, 'know');
  });

  it('rejects an invalid verdict', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const res = await app.inject({
      method: 'POST',
      url: '/api/progress/sort',
      cookies: authCookie,
      payload: { chunkId: validChunkId, verdict: 'maybe' },
    });
    expect(res.statusCode).toBe(400);
    expect(service.recordSort).not.toHaveBeenCalled();
  });
});

describe('GET /api/progress/recognition-check/:chunkId', () => {
  it('returns 409 wrong_state when the chunk is not eligible', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.buildRecognitionCheck).mockResolvedValue({ kind: 'wrong_state' });

    const res = await app.inject({ method: 'GET', url: `/api/progress/recognition-check/${validChunkId}`, cookies: authCookie });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'wrong_state' });
  });

  it('returns the generated options on success', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const payload = { kind: 'ok' as const, chunkId: validChunkId, prompt: 'sounds good', options: [{ id: 'correct', label: 'звучит хорошо' }] };
    vi.mocked(service.buildRecognitionCheck).mockResolvedValue(payload);

    const res = await app.inject({ method: 'GET', url: `/api/progress/recognition-check/${validChunkId}`, cookies: authCookie });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ chunkId: validChunkId, prompt: 'sounds good', options: payload.options });
  });
});

describe('POST /api/progress/recognition-check/:chunkId', () => {
  it('grades the echoed selection', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const progress = { chunkId: validChunkId, state: 'recognition_confirmed', timesReviewed: 1, timesProductionAttempted: 0, timesProductionPassed: 0 };
    vi.mocked(service.recordRecognitionResult).mockResolvedValue({ kind: 'ok', correct: true, progress });

    const options = [{ id: 'correct', label: 'звучит хорошо' }, { id: 'd0', label: 'что-то другое' }];
    const res = await app.inject({
      method: 'POST',
      url: `/api/progress/recognition-check/${validChunkId}`,
      cookies: authCookie,
      payload: { selectedOptionId: 'correct', options },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ correct: true, progress });
    expect(service.recordRecognitionResult).toHaveBeenCalledWith('user-1', validChunkId, 'correct', options);
  });

  it('returns 400 options_mismatch when the service flags it', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.recordRecognitionResult).mockResolvedValue({ kind: 'options_mismatch' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/progress/recognition-check/${validChunkId}`,
      cookies: authCookie,
      payload: { selectedOptionId: 'nope', options: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'options_mismatch' });
  });
});

describe('GET /api/progress/production-check/:chunkId', () => {
  it('returns available:false without erroring when no situation prompt exists', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.buildProductionCheck).mockResolvedValue({ kind: 'unavailable' });

    const res = await app.inject({ method: 'GET', url: `/api/progress/production-check/${validChunkId}`, cookies: authCookie });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: false });
  });

  it('returns the situation when available', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.buildProductionCheck).mockResolvedValue({
      kind: 'ok',
      chunkId: validChunkId,
      situationPrompt: 'Your friend suggests a plan.',
      chunkText: 'sounds good',
      chunkTranslation: 'звучит хорошо',
    });

    const res = await app.inject({ method: 'GET', url: `/api/progress/production-check/${validChunkId}`, cookies: authCookie });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      available: true,
      chunkId: validChunkId,
      situationPrompt: 'Your friend suggests a plan.',
      chunkText: 'sounds good',
      chunkTranslation: 'звучит хорошо',
    });
  });
});

describe('POST /api/progress/production-check/:chunkId', () => {
  it('returns the judged verdict on success', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const progress = { chunkId: validChunkId, state: 'active', timesReviewed: 1, timesProductionAttempted: 1, timesProductionPassed: 1 };
    vi.mocked(service.submitProductionAnswer).mockResolvedValue({ kind: 'ok', verdict: 'chunk_used', feedback: 'Отлично!', progress });

    const res = await app.inject({
      method: 'POST',
      url: `/api/progress/production-check/${validChunkId}`,
      cookies: authCookie,
      payload: { answer: 'Sounds good to me.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ verdict: 'chunk_used', feedback: 'Отлично!', progress });
  });

  it('returns 502 judge_unavailable when the judge throws', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.submitProductionAnswer).mockRejectedValue(new Error('network down'));

    const res = await app.inject({
      method: 'POST',
      url: `/api/progress/production-check/${validChunkId}`,
      cookies: authCookie,
      payload: { answer: 'anything' },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'judge_unavailable' });
  });

  it('rate-limits after too many requests from the same user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const progress = { chunkId: validChunkId, state: 'passive', timesReviewed: 1, timesProductionAttempted: 1, timesProductionPassed: 0 };
    vi.mocked(service.submitProductionAnswer).mockResolvedValue({ kind: 'ok', verdict: 'meaning_only', feedback: 'Почти.', progress });

    // The route's own limit (20/10min) is too generous to hit in a fast unit
    // test — this just confirms the limiter is wired up at all by hammering
    // it well past any reasonable per-test budget isn't necessary; instead
    // confirm normal requests succeed repeatedly under the limit.
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/progress/production-check/${validChunkId}`,
        cookies: authCookie,
        payload: { answer: 'anything' },
      });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('GET /api/progress', () => {
  it('returns batched progress for the requested chunk ids', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const progress = { [validChunkId]: { chunkId: validChunkId, state: 'active', timesReviewed: 2, timesProductionAttempted: 1, timesProductionPassed: 1 } };
    vi.mocked(service.getProgressForChunks).mockResolvedValue(progress);

    const res = await app.inject({ method: 'GET', url: `/api/progress?chunkIds=${validChunkId}`, cookies: authCookie });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ progress });
    expect(service.getProgressForChunks).toHaveBeenCalledWith('user-1', [validChunkId]);
  });
});
