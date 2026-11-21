import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../auth/session.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/session.js')>('../auth/session.js');
  return { SESSION_COOKIE_NAME: actual.SESSION_COOKIE_NAME, extractSessionToken: actual.extractSessionToken, getSession: vi.fn() };
});
vi.mock('./service.js', () => ({
  getProgramForUser: vi.fn(),
  getPlacementResult: vi.fn(),
  getTopicStudy: vi.fn(),
  startTopicAttempt: vi.fn(),
  submitPlacementTest: vi.fn(),
  submitTopicAttempt: vi.fn(),
}));

const session = await import('../auth/session.js');
const service = await import('./service.js');
const { programRoutes } = await import('./routes.js');

const authenticatedSession = { userId: 'user-1', email: 'person@example.com', displayName: 'Person', providerImageUrl: null, isAdmin: false };
const topicId = '11111111-1111-1111-1111-111111111111';
const attemptId = '22222222-2222-2222-2222-222222222222';

let app: FastifyInstance;

beforeEach(async () => {
  vi.mocked(session.getSession).mockReset();
  vi.mocked(service.getProgramForUser).mockReset();
  vi.mocked(service.getPlacementResult).mockReset();
  vi.mocked(service.getTopicStudy).mockReset();
  vi.mocked(service.startTopicAttempt).mockReset();
  vi.mocked(service.submitPlacementTest).mockReset();
  vi.mocked(service.submitTopicAttempt).mockReset();

  app = Fastify();
  await app.register(cookie, { secret: process.env.SESSION_SECRET });
  await app.register(programRoutes, { prefix: '/api/program' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const quota = { allowed: true, limit: 1, used: 1, resetsAt: '2027-01-01T00:00:00.000Z' };
const authCookie = { [session.SESSION_COOKIE_NAME]: 'a-valid-token' };
const placementBody = {
  fromLevel: 'B1',
  toLevel: 'B2',
  purpose: ['Работа'],
  mcqAnswers: { '1': 'A' },
  open9: 'answer nine',
  open10: 'answer ten',
  essay: 'a short essay',
};

describe('GET /api/program', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/program' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the program for the authenticated user', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.getProgramForUser).mockResolvedValue({ status: 'none', placement: { history: [], quota } });

    const res = await app.inject({ method: 'GET', url: '/api/program', cookies: authCookie });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'none', placement: { history: [], quota } });
    expect(service.getProgramForUser).toHaveBeenCalledWith('user-1');
  });
});

describe('GET /api/program/placement-results/:id', () => {
  it('looks up result details in the authenticated learner account', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.getPlacementResult).mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: `/api/program/placement-results/${attemptId}`, cookies: authCookie });
    expect(res.statusCode).toBe(404);
    expect(service.getPlacementResult).toHaveBeenCalledWith('user-1', attemptId);
  });
});

describe('GET /api/program/topics/:id/study', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/program/topics/${topicId}/study` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when the topic is not found', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.getTopicStudy).mockResolvedValue({ kind: 'not_found' });

    const res = await app.inject({ method: 'GET', url: `/api/program/topics/${topicId}/study`, cookies: authCookie });

    expect(res.statusCode).toBe(404);
  });

  it('returns the study material on success', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const study = { explanation: 'e', keyPoints: ['a'], contrastExamples: [], exampleChunks: [] };
    vi.mocked(service.getTopicStudy).mockResolvedValue({ kind: 'ok', study });

    const res = await app.inject({ method: 'GET', url: `/api/program/topics/${topicId}/study`, cookies: authCookie });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ study });
    expect(service.getTopicStudy).toHaveBeenCalledWith('user-1', topicId);
  });

  it('returns 502 when generation throws', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.getTopicStudy).mockRejectedValue(new Error('provider down'));

    const res = await app.inject({ method: 'GET', url: `/api/program/topics/${topicId}/study`, cookies: authCookie });

    expect(res.statusCode).toBe(502);
  });
});

describe('POST /api/program/placement-test', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/program/placement-test', payload: placementBody });
    expect(res.statusCode).toBe(401);
    expect(service.submitPlacementTest).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const res = await app.inject({ method: 'POST', url: '/api/program/placement-test', cookies: authCookie, payload: { ...placementBody, fromLevel: 'not-a-level' } });
    expect(res.statusCode).toBe(400);
    expect(service.submitPlacementTest).not.toHaveBeenCalled();
  });

  it.each([placementBody.fromLevel, null])('submits the placement test with starting level %s', async (fromLevel) => {
    const payload = { ...placementBody, fromLevel };
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const result = { overallLevel: 'B1', topics: [] } as never;
    const topics = [{ id: 't1' }] as never;
    vi.mocked(service.submitPlacementTest).mockResolvedValue({ kind: 'ok', result, topics });

    const res = await app.inject({ method: 'POST', url: '/api/program/placement-test', cookies: authCookie, payload });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result, topics });
    expect(service.submitPlacementTest).toHaveBeenCalledWith('user-1', payload);
  });

  it('returns the quota when no checks remain this month', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.submitPlacementTest).mockResolvedValue({ kind: 'limit_reached', quota });
    const res = await app.inject({ method: 'POST', url: '/api/program/placement-test', cookies: authCookie, payload: placementBody });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: 'placement_limit_reached', quota });
  });

  it('returns 502 when grading throws', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.submitPlacementTest).mockRejectedValue(new Error('provider down'));

    const res = await app.inject({ method: 'POST', url: '/api/program/placement-test', cookies: authCookie, payload: placementBody });

    expect(res.statusCode).toBe(502);
  });
});

describe('POST /api/program/topics/:id/attempts', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/program/topics/${topicId}/attempts` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 409 when the topic is already mastered', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.startTopicAttempt).mockResolvedValue({ kind: 'already_mastered' });

    const res = await app.inject({ method: 'POST', url: `/api/program/topics/${topicId}/attempts`, cookies: authCookie });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'already_mastered' });
  });

  it('returns 409 when a reconfirmation is not yet due', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.startTopicAttempt).mockResolvedValue({ kind: 'not_due' });

    const res = await app.inject({ method: 'POST', url: `/api/program/topics/${topicId}/attempts`, cookies: authCookie });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'not_due' });
  });

  it('starts an attempt and returns redacted items', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const items = [{ type: 'choice', q: 'q', options: ['a', 'b'] }] as never;
    vi.mocked(service.startTopicAttempt).mockResolvedValue({ kind: 'ok', attemptId, attemptKind: 'initial', items });

    const res = await app.inject({ method: 'POST', url: `/api/program/topics/${topicId}/attempts`, cookies: authCookie });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ attemptId, attemptKind: 'initial', items });
    expect(service.startTopicAttempt).toHaveBeenCalledWith('user-1', topicId);
  });

  it('returns 502 when exercise generation throws', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.startTopicAttempt).mockRejectedValue(new Error('provider down'));

    const res = await app.inject({ method: 'POST', url: `/api/program/topics/${topicId}/attempts`, cookies: authCookie });

    expect(res.statusCode).toBe(502);
  });
});

describe('POST /api/program/topics/:id/attempts/:attemptId/submit', () => {
  const url = `/api/program/topics/${topicId}/attempts/${attemptId}/submit`;

  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { answers: {} } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when the attempt is not found', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.submitTopicAttempt).mockResolvedValue({ kind: 'attempt_not_found' });

    const res = await app.inject({ method: 'POST', url, cookies: authCookie, payload: { answers: {} } });

    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when the attempt was already graded', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.submitTopicAttempt).mockResolvedValue({ kind: 'already_graded' });

    const res = await app.inject({ method: 'POST', url, cookies: authCookie, payload: { answers: {} } });

    expect(res.statusCode).toBe(409);
  });

  it('grades the attempt and reports newly discovered topics', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    const result = { scoreOutOf10: 8, passed: true, verdictLabel: 'Хорошо', notes: [], discoveredTopics: [{ key: 'articles' }], nextReviewInDays: 3 } as never;
    vi.mocked(service.submitTopicAttempt).mockResolvedValue({ kind: 'ok', result, newTopicsAdded: 1 });

    const res = await app.inject({ method: 'POST', url, cookies: authCookie, payload: { answers: { '0': 'A' } } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result, newTopicsAdded: 1 });
    expect(service.submitTopicAttempt).toHaveBeenCalledWith('user-1', topicId, attemptId, { '0': 'A' });
  });

  it('returns 502 when grading throws', async () => {
    vi.mocked(session.getSession).mockResolvedValue(authenticatedSession);
    vi.mocked(service.submitTopicAttempt).mockRejectedValue(new Error('provider down'));

    const res = await app.inject({ method: 'POST', url, cookies: authCookie, payload: { answers: {} } });

    expect(res.statusCode).toBe(502);
  });
});
