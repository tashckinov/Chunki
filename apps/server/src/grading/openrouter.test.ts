import { beforeEach, describe, expect, it, vi } from 'vitest';
import { READING_QUESTIONS } from '@app/shared';
import { OpenRouterGradingProvider } from './openrouter.js';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const grader = new OpenRouterGradingProvider({ OPENROUTER_API_KEY: 'test-key', OPENROUTER_GRADING_MODEL: 'openai/gpt-4.1' });
const submission = { fromLevel: null, toLevel: 'B1', purpose: [], mcqAnswers: {}, open9: '', open10: '', essay: '' } satisfies import('@app/shared').PlacementTestSubmission;
const grade = {
  correctness: 'n/a', chunkUsage: [], grammar: 'Ответ отсутствует.', naturalness: 'Ответ отсутствует.',
  score: 0, feedback: 'Попробуйте ответить.', suggestedAnswer: '',
};
const complete = {
  openGrades: READING_QUESTIONS.map(({ n }) => ({ n, ...grade })),
  essayGrade: grade, overallLevel: 'A1',
  skills: [{ label: 'Грамматика', tag: 'A1', score: 0 }],
  aboveLevel: 'Уровень пока не превышен.', belowLevel: 'Не хватает письменной практики.',
  topics: Array.from({ length: 8 }, (_, i) => ({ key: `topic-${i}`, title: 'Артикли', category: 'Грамматика', rationale: 'Нужно повторить основы.' })),
};

function completion(output: unknown, reason = 'tool_calls') {
  return { choices: [{ finish_reason: reason, message: { tool_calls: [
    { type: 'function', function: { name: 'submit_placement_grade', arguments: JSON.stringify(output) } },
  ] } }] };
}

beforeEach(() => create.mockReset());

describe('OpenRouter grammar grading', () => {
  it('uses the configured model and accepts a complete placement verdict', async () => {
    create.mockResolvedValue(completion(complete));

    const result = await grader.gradePlacementTest(submission);

    expect(result.overallLevel).toBe('A1');
    expect(result.topics).toHaveLength(8);
    expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      model: 'openai/gpt-4.1', max_tokens: 4096,
      tool_choice: { type: 'function', function: { name: 'submit_placement_grade' } },
    }));
  });

  it('rejects cut-off or incomplete verdicts', async () => {
    create.mockResolvedValueOnce(completion(complete, 'length'))
      .mockResolvedValueOnce(completion({ overallLevel: 'A1' }));

    await expect(grader.gradePlacementTest(submission)).rejects.toThrow('finish_reason=length');
    await expect(grader.gradePlacementTest(submission)).rejects.toThrow('failed validation');
  });
});
