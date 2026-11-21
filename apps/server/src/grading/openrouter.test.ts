import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_PLACEMENT_TEST, READING_QUESTIONS } from '@app/shared';
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
  topics: [{ key: 'articles', title: 'Артикли: a, an, the', category: 'Грамматика', level: 'A2', rationale: 'Нужно повторить основы.' }],
};

function completion(output: unknown, reason = 'tool_calls', name = 'submit_placement_grade') {
  return { choices: [{ finish_reason: reason, message: { tool_calls: [
    { type: 'function', function: { name, arguments: JSON.stringify(output) } },
  ] } }] };
}

beforeEach(() => create.mockReset());

describe('OpenRouter grammar grading', () => {
  it('uses the configured model and accepts a complete placement verdict', async () => {
    create.mockResolvedValue(completion(complete));

    const result = await grader.gradePlacementTest(submission);

    expect(result.overallLevel).toBe('A1');
    expect(result.topics).toHaveLength(1);
    expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      model: 'openai/gpt-4.1', max_tokens: 4096,
      tool_choice: { type: 'function', function: { name: 'submit_placement_grade' } },
    }));
  });

  it('scores the saved variant and uses its reading and writing prompts', async () => {
    create.mockResolvedValue(completion(complete));
    const definition = structuredClone(BUILTIN_PLACEMENT_TEST);
    definition.mcq[0].correct = 'D';
    definition.readingQuestions[0].q = 'What did the neighbour do?';
    definition.essayPrompt = 'Write about your neighbour.';

    const result = await grader.gradePlacementTest({ ...submission, mcqAnswers: { 1: 'D' } }, definition);

    expect(result.mcqScore.correct).toBe(1);
    const messages = create.mock.calls[0][0].messages;
    expect(messages[1].content).toContain(definition.readingQuestions[0].q);
    expect(messages[1].content).toContain(definition.essayPrompt);
  });

  it('rejects cut-off or incomplete verdicts', async () => {
    create.mockResolvedValueOnce(completion(complete, 'length'))
      .mockResolvedValueOnce(completion({ overallLevel: 'A1' }));

    await expect(grader.gradePlacementTest(submission)).rejects.toThrow('finish_reason=length');
    await expect(grader.gradePlacementTest(submission)).rejects.toThrow('failed validation');
  });

  it('requests ChatMD in topic explanations and accepts empty supplementary fields', async () => {
    const explanation = ':::question\nI bought ___ book.\n+ a | Впервые.\n- the | Книга уже известна.\n:::';
    const study = { explanation, keyPoints: [], contrastExamples: [], exampleChunks: [] };
    create.mockResolvedValue(completion(study, 'tool_calls', 'submit_topic_study'));

    const result = await grader.generateTopicStudy({ key: 'articles', title: 'Артикли', category: 'Грамматика', level: 'A2' });

    expect(result).toEqual(study);
    const instruction = create.mock.calls[0][0].messages[1].content;
    expect(instruction).toContain(':::question');
    expect(instruction).toContain('+ a |');
    expect(instruction).toContain('1–2 questions near the relevant rule');
    expect(instruction).toContain('CEFR: A2');
  });
});
