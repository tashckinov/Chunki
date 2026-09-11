import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProgressRow, ChunkWithSituationsRow } from './repository.js';
import type { AccountStatus } from '../users/repository.js';

vi.mock('./repository.js', () => ({
  findProgress: vi.fn(),
  upsertProgress: vi.fn(),
  findProgressForChunks: vi.fn(),
  findChunkWithSituationPrompts: vi.fn(),
  findDistractorTranslations: vi.fn(),
}));
vi.mock('../users/repository.js', () => ({
  findAccountStatus: vi.fn(),
  incrementProductionChecksUsed: vi.fn(),
}));
vi.mock('../../openrouter/index.js', () => ({
  getProductionJudgeProvider: vi.fn(),
}));
vi.mock('../aiLogs/repository.js', () => ({
  recordAiCallLog: vi.fn(),
}));
vi.mock('../dialogues/service.js', () => ({
  findSituationDialogueForLearner: vi.fn(),
}));

const repo = await import('./repository.js');
const users = await import('../users/repository.js');
const openrouter = await import('../../openrouter/index.js');
const aiLogs = await import('../aiLogs/repository.js');
const dialogues = await import('../dialogues/service.js');
const { buildProductionCheck, submitProductionAnswer } = await import('./service.js');

const userId = 'user-1';
const chunkId = 'chunk-1';

function fakeChunk(overrides: Partial<ChunkWithSituationsRow> = {}): ChunkWithSituationsRow {
  return { id: chunkId, text: 'sounds good', translation: 'звучит хорошо', example: null, situation_prompts: [{ text: 'A friend suggests a plan.', parts: [] }], ...overrides };
}

function fakeProgress(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'p1',
    user_id: userId,
    chunk_id: chunkId,
    state: 'self_known',
    times_reviewed: 1,
    times_production_attempted: 0,
    times_production_passed: 0,
    last_reviewed_at: new Date('2026-01-01T00:00:00Z'),
    last_production_check_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fakeAccount(overrides: Partial<AccountStatus> = {}): AccountStatus {
  return { premiumUntil: null, isAdmin: false, productionChecksUsed: 0, ...overrides };
}

const fakeJudge = { name: 'mock', model: 'mock', judgeProduction: vi.fn() };

beforeEach(() => {
  vi.mocked(repo.findProgress).mockReset();
  vi.mocked(repo.upsertProgress).mockReset();
  vi.mocked(repo.findChunkWithSituationPrompts).mockReset();
  vi.mocked(users.findAccountStatus).mockReset();
  vi.mocked(users.incrementProductionChecksUsed).mockReset().mockResolvedValue(undefined);
  vi.mocked(openrouter.getProductionJudgeProvider).mockReset().mockReturnValue(fakeJudge);
  fakeJudge.judgeProduction.mockReset();
  vi.mocked(aiLogs.recordAiCallLog).mockReset().mockResolvedValue(undefined as never);
  // No "Ситуация" comic by default — existing tests exercise the free-text situationPrompt path unchanged; dialogue-mode gets its own describe block below.
  vi.mocked(dialogues.findSituationDialogueForLearner).mockReset().mockResolvedValue(null);

  vi.mocked(repo.findChunkWithSituationPrompts).mockResolvedValue(fakeChunk());
  vi.mocked(repo.findProgress).mockResolvedValue(fakeProgress());
});

describe('buildProductionCheck — free-tier limit', () => {
  it('is available for a free user under the limit', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount({ productionChecksUsed: 2 }));
    const result = await buildProductionCheck(userId, chunkId);
    expect(result.kind).toBe('ok');
  });

  it('is blocked for a free user at the limit', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount({ productionChecksUsed: 3 }));
    const result = await buildProductionCheck(userId, chunkId);
    expect(result.kind).toBe('limit_reached');
  });

  it('bypasses the limit for an active-premium user', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(
      fakeAccount({ productionChecksUsed: 10, premiumUntil: new Date(Date.now() + 86_400_000) }),
    );
    const result = await buildProductionCheck(userId, chunkId);
    expect(result.kind).toBe('ok');
  });

  it('bypasses the limit for an admin user', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount({ productionChecksUsed: 10, isAdmin: true }));
    const result = await buildProductionCheck(userId, chunkId);
    expect(result.kind).toBe('ok');
  });

  it('does not treat an expired premiumUntil as active', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(
      fakeAccount({ productionChecksUsed: 3, premiumUntil: new Date(Date.now() - 86_400_000) }),
    );
    const result = await buildProductionCheck(userId, chunkId);
    expect(result.kind).toBe('limit_reached');
  });
});

describe('buildProductionCheck — "Ситуация" comic (dialogue mode)', () => {
  const fakeDialogue = {
    precedingMessages: [{ characterName: 'Alex', imageUrl: '/img/alex.png', side: 'left' as const, text: 'How was your trip?' }],
    blank: { characterName: 'Sam', imageUrl: '/img/sam.png', side: 'right' as const },
    modelAnswer: 'Sounds good to me.',
  };

  it('prefers the dialogue comic over the free-text situation prompt when one is ready', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount());
    vi.mocked(dialogues.findSituationDialogueForLearner).mockResolvedValue(fakeDialogue);

    const result = await buildProductionCheck(userId, chunkId);

    expect(result).toEqual({
      kind: 'ok',
      mode: 'dialogue',
      chunkId,
      chunkText: 'sounds good',
      chunkTranslation: 'звучит хорошо',
      dialogue: { precedingMessages: fakeDialogue.precedingMessages, blank: fakeDialogue.blank },
    });
  });

  it('falls back to the free-text situation prompt when no comic is ready', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount());
    vi.mocked(dialogues.findSituationDialogueForLearner).mockResolvedValue(null);

    const result = await buildProductionCheck(userId, chunkId);

    expect(result.kind).toBe('ok');
    expect(result.kind === 'ok' && result.mode).toBe('situation');
  });

  it('is available via the comic even when the chunk has no situation prompts at all', async () => {
    vi.mocked(repo.findChunkWithSituationPrompts).mockResolvedValue(fakeChunk({ situation_prompts: [] }));
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount());
    vi.mocked(dialogues.findSituationDialogueForLearner).mockResolvedValue(fakeDialogue);

    const result = await buildProductionCheck(userId, chunkId);
    expect(result.kind).toBe('ok');
  });

  it('is unavailable when there is neither a ready comic nor any situation prompts', async () => {
    vi.mocked(repo.findChunkWithSituationPrompts).mockResolvedValue(fakeChunk({ situation_prompts: [] }));
    vi.mocked(dialogues.findSituationDialogueForLearner).mockResolvedValue(null);

    const result = await buildProductionCheck(userId, chunkId);
    expect(result.kind).toBe('unavailable');
  });
});

describe('submitProductionAnswer — "Ситуация" comic (dialogue mode)', () => {
  it('judges against a prompt synthesized from the dialogue and returns modelAnswer', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount());
    vi.mocked(dialogues.findSituationDialogueForLearner).mockResolvedValue({
      precedingMessages: [{ characterName: 'Alex', imageUrl: '/img/alex.png', side: 'left', text: 'How was your trip?' }],
      blank: { characterName: 'Sam', imageUrl: '/img/sam.png', side: 'right' },
      modelAnswer: 'Sounds good to me.',
    });
    fakeJudge.judgeProduction.mockResolvedValue({ verdict: 'chunk_used', feedback: 'Отлично!' });
    vi.mocked(repo.upsertProgress).mockResolvedValue(fakeProgress({ state: 'active', times_production_attempted: 1, times_production_passed: 1 }));

    const result = await submitProductionAnswer(userId, chunkId, 'Sounds good, thanks!');

    expect(result.kind).toBe('ok');
    expect(result.kind === 'ok' ? result.modelAnswer : undefined).toBe('Sounds good to me.');
    const judgeInput = fakeJudge.judgeProduction.mock.calls[0][0];
    expect(judgeInput.situationPrompt).toContain('Alex: How was your trip?');
    expect(judgeInput.situationPrompt).toContain('Sam');
    expect(judgeInput.situationPrompt).not.toContain('Sounds good to me.');
  });
});

describe('submitProductionAnswer — free-tier limit', () => {
  it('blocks a free user at the limit without calling the judge', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount({ productionChecksUsed: 3 }));
    const result = await submitProductionAnswer(userId, chunkId, 'Sounds good to me.');
    expect(result.kind).toBe('limit_reached');
    expect(fakeJudge.judgeProduction).not.toHaveBeenCalled();
    expect(users.incrementProductionChecksUsed).not.toHaveBeenCalled();
  });

  it('increments the counter once for a free user after a successful judge call', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount({ productionChecksUsed: 0 }));
    fakeJudge.judgeProduction.mockResolvedValue({ verdict: 'chunk_used', feedback: 'Отлично!' });
    vi.mocked(repo.upsertProgress).mockResolvedValue(fakeProgress({ state: 'active', times_production_attempted: 1, times_production_passed: 1 }));

    const result = await submitProductionAnswer(userId, chunkId, 'Sounds good to me.');

    expect(result.kind).toBe('ok');
    expect(users.incrementProductionChecksUsed).toHaveBeenCalledTimes(1);
    expect(users.incrementProductionChecksUsed).toHaveBeenCalledWith(userId);
  });

  it('does not increment the counter when the judge call throws', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount({ productionChecksUsed: 0 }));
    fakeJudge.judgeProduction.mockRejectedValue(new Error('judge down'));

    await expect(submitProductionAnswer(userId, chunkId, 'Sounds good to me.')).rejects.toThrow('judge down');
    expect(users.incrementProductionChecksUsed).not.toHaveBeenCalled();
  });

  it('does not increment the counter for a premium user', async () => {
    vi.mocked(users.findAccountStatus).mockResolvedValue(fakeAccount({ premiumUntil: new Date(Date.now() + 86_400_000) }));
    fakeJudge.judgeProduction.mockResolvedValue({ verdict: 'chunk_used', feedback: 'Отлично!' });
    vi.mocked(repo.upsertProgress).mockResolvedValue(fakeProgress({ state: 'active' }));

    const result = await submitProductionAnswer(userId, chunkId, 'Sounds good to me.');

    expect(result.kind).toBe('ok');
    expect(users.incrementProductionChecksUsed).not.toHaveBeenCalled();
  });
});
