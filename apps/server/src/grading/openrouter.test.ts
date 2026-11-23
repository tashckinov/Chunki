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
  topics: [{ key: 'a2-articles', rationale: 'Нужно повторить основы.' }],
};

function completion(output: unknown, reason = 'tool_calls', name = 'submit_placement_grade') {
  return { choices: [{ finish_reason: reason, message: { tool_calls: [
    { type: 'function', function: { name, arguments: JSON.stringify(output) } },
  ] } }] };
}

beforeEach(() => create.mockReset());

describe('OpenRouter grammar grading', () => {
  it('adds the question reference only when the answer was wrong', async () => {
    const question = BUILTIN_PLACEMENT_TEST.mcq.find(({ n }) => n === 5)!;
    create.mockResolvedValue(completion({
      ...complete,
      topics: [{ ...complete.topics[0], questionNumber: 5 }, { ...complete.topics[0], questionNumber: 6 }],
    }));

    const result = await grader.gradePlacementTest({
      ...submission, mcqAnswers: { 5: question.correct === 'A' ? 'B' : 'A' },
    });
    expect(result.topics.map(({ rationale }) => rationale)).toEqual([
      'В вопросе №5 допущена ошибка. Нужно повторить основы.',
      'Нужно повторить основы.',
    ]);
  });

  it('uses the configured model and accepts a complete placement verdict', async () => {
    create.mockResolvedValue(completion(complete));

    const result = await grader.gradePlacementTest(submission);

    expect(result.overallLevel).toBe('A1');
    expect(result.topics).toHaveLength(1);
    expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      model: 'openai/gpt-4.1', max_tokens: 6144,
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

  it('accepts all evidenced recommendations from both placement and saved results', async () => {
    const catalog = Array.from({ length: 13 }, (_, i) => ({
      id: `b1-topic-${i}`, title: `Тема ${i}`, level: 'B1' as const, category: 'Grammar' as const,
      objective: 'Учебная цель.', subtopics: [],
    }));
    const plan = { catalog, assignedKeys: [], currentLevel: 'A2' as const, targetLevel: 'B1' as const };
    const topics = catalog.map(({ id }) => ({ key: id, rationale: 'В ответах есть ошибки.' }));
    create.mockResolvedValueOnce(completion({ ...complete, topics }))
      .mockResolvedValueOnce(completion({ topics }, 'tool_calls', 'recommend_program_topics'));

    const result = await grader.gradePlacementTest(submission, BUILTIN_PLACEMENT_TEST, plan);
    expect(result.topics).toEqual(topics);
    await expect(grader.recommendProgramTopics({ ...result, corrections: [] }, plan)).resolves.toEqual(topics);
    expect(create.mock.calls[1][0].messages[1].content).toContain('Review every diagnostic item');
    expect(create.mock.calls[1][0].messages[1].content).toContain(catalog.at(-1)?.id);
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

    const result = await grader.generateTopicStudy({ key: 'articles', title: 'Старое название', category: 'Грамматика', level: 'A2' }, {
      id: 'a2-articles', title: 'Артикли', category: 'Grammar', level: 'A2',
      objective: 'Выбрать артикль при первом упоминании', subtopics: ['a и an'],
    });

    expect(result).toEqual(study);
    const instruction = create.mock.calls[0][0].messages[1].content;
    expect(instruction).toContain('English is the target language');
    expect(instruction).toContain('Never ask the learner to produce Russian');
    expect(instruction).toContain(':::question');
    expect(instruction).toContain('+ [Correct option] |');
    expect(instruction).toContain('1–2 questions near the relevant rule');
    expect(instruction).toContain('Выбрать артикль при первом упоминании');
    expect(instruction).toContain('"level":"A2"');
    expect(instruction).toContain('a и an');
    expect(instruction).not.toContain('Старое название');
  });

  it('explains a fixed topic at a different learner level', async () => {
    const topic = { key: 'tenses', title: 'Времена', category: 'Грамматика', level: 'B1' } as const;
    const study = { explanation: '**I work every day.**', keyPoints: [], contrastExamples: [], exampleChunks: [] };
    create.mockResolvedValue(completion(study, 'tool_calls', 'submit_topic_study'));

    await expect(grader.generateTopicStudy(topic, undefined, 'A1')).resolves.toEqual(study);
    const request = create.mock.calls[0][0];
    expect(request.messages[1].content).toContain('CEFR: B1');
    expect(request.messages[1].content).toContain('current CEFR level is A1');
    expect(request.messages[1].content).toContain('worked examples');
  });

});
