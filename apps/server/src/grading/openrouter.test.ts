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


});

describe('topic exercise corrections', () => {
  const topic = { key: 'present-simple', title: 'Present Simple', category: 'Грамматика', level: 'A2', rationale: 'Практика' } as const;
  const choice = { type: 'choice' as const, q: 'She ___ every day.', options: ['run', 'runs'], answer: 'runs' };
  const written = { type: 'write' as const, q: 'Describe her routine.', rows: 2, placeholder: 'Your answer' };
  const feedback = 'После she в Present Simple к глаголу добавляется -s.';

  it('returns wrong and partial answers in the original exercise order', async () => {
    create.mockResolvedValue(completion({
      writeGrades: [{ ...grade, itemIndex: 1, correctness: 'partial', score: 0.5, feedback, suggestedAnswer: 'She runs every day.' }],
      choiceExplanations: [{ itemIndex: 2, explanation: feedback }],
      notes: [], discoveredTopics: [],
    }, 'tool_calls', 'submit_exercise_grade'));

    const result = await grader.gradeExercises({
      topic, items: [choice, written, choice], answers: { 0: 'runs', 1: 'She run every day', 2: 'run' },
    });

    expect(result.scoreOutOf10).toBe(5);
    expect(result.corrections).toEqual([
      { questionNumber: 2, prompt: written.q, answer: 'She run every day', correction: 'She runs every day.', explanation: feedback },
      { questionNumber: 3, prompt: choice.q, answer: 'run', correction: 'runs', explanation: feedback },
    ]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('explains an unanswered choice and skips the model when every choice is correct', async () => {
    create.mockResolvedValue(completion({
      writeGrades: [], choiceExplanations: [{ itemIndex: 0, explanation: feedback }], notes: [], discoveredTopics: [],
    }, 'tool_calls', 'submit_exercise_grade'));

    await expect(grader.gradeExercises({ topic, items: [choice], answers: {} })).resolves.toMatchObject({
      corrections: [{ questionNumber: 1, answer: '', correction: 'runs', explanation: feedback }],
    });
    await expect(grader.gradeExercises({ topic, items: [choice], answers: { 0: 'runs' } })).resolves.toMatchObject({
      scoreOutOf10: 10, corrections: [],
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

it('tells the grader to accept valid drinks without imposing categories', async () => {
  const question = 'Name three drinks you can order in a café.';
  const answer = 'Latte, Cappuccino, Americano';
  create.mockResolvedValue(completion({
    writeGrades: [{ ...grade, itemIndex: 0, correctness: 'correct', score: 1, feedback: 'Названы три напитка.' }],
    choiceExplanations: [], notes: [], discoveredTopics: [],
  }, 'tool_calls', 'submit_exercise_grade'));
  const result = await grader.gradeExercises({
    topic: { key: 'drinks', title: 'Drinks', category: 'Лексика', level: 'A1', rationale: '' },
    items: [{ type: 'write', q: question, rows: 2, placeholder: '' }],
    answers: { 0: answer },
  });
  const messages = create.mock.calls[0][0].messages;
  expect(messages[0].content).toContain('Never add unstated constraints');
  expect(messages[0].content).toContain('reference answers as examples');
  expect(messages[0].content).toContain(answer);
  expect(messages[1].content).toContain(question);
  expect(result).toMatchObject({ scoreOutOf10: 10, passed: true, corrections: [] });
});

it('reviews generated exercises before serving them and replaces a rejected set', async () => {
  const invalid = { type: 'choice', q: 'Find the sentence in which no article is needed: ___ water is useful.',
    options: ['A', 'The', 'No article'], answer: 'No article' };
  const valid = { ...invalid, q: 'Choose what fits the blank: ___ water is useful.' };
  const set = (item: typeof valid) => ({ items: [item, ...Array.from({ length: 4 }, (_, index) => ({
    type: 'write', q: 'Write an example for situation ' + index,
  }))] });
  create.mockResolvedValueOnce(completion(set(invalid), 'tool_calls', 'submit_topic_exercises'))
    .mockResolvedValueOnce(completion({ valid: false }, 'tool_calls', 'review_topic_exercises'))
    .mockResolvedValueOnce(completion(set(valid), 'tool_calls', 'submit_topic_exercises'))
    .mockResolvedValueOnce(completion({ valid: true }, 'tool_calls', 'review_topic_exercises'));

  const result = await grader.generateTopicExercises({ key: 'articles', title: 'Articles', category: 'Грамматика', level: 'A1', rationale: '' });
  expect(result[0]).toEqual(valid);
  expect(create).toHaveBeenCalledTimes(4);
  expect(create.mock.calls[1][0].messages[0].content).toContain('Never give away the correct answer');
  expect(create.mock.calls[1][0].messages[1].content).toContain(invalid.q);
});
