import Anthropic from '@anthropic-ai/sdk';
import { scoreMcq } from '@app/shared';
import type {
  ExerciseItem,
  ExercisesGradeResult,
  ExercisesSubmission,
  GradeDetail,
  GradingProvider,
  PlacementGradeResult,
  PlacementTestSubmission,
  TopicStudyContent,
  TopicSuggestion,
} from '@app/shared';
import { READING_PASSAGE, READING_QUESTIONS } from '@app/shared';

const TOPIC_CATEGORY_ENUM = ['Грамматика', 'Лексика', 'Использование языка', 'Понимание', 'Письмо'];

const TOPIC_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string', description: 'Short kebab-case slug in English, e.g. "articles" or "reported-speech-questions".' },
    title: { type: 'string', description: 'Short Russian title shown to the learner.' },
    category: { type: 'string', enum: TOPIC_CATEGORY_ENUM },
    rationale: { type: 'string', description: 'One short Russian sentence — concrete evidence from this answer for why this topic is weak.' },
  },
  required: ['key', 'title', 'category', 'rationale'],
} as const;

const GRADE_DETAIL_SCHEMA = {
  type: 'object',
  properties: {
    correctness: { type: 'string', enum: ['correct', 'partial', 'incorrect', 'n/a'] },
    chunkUsage: { type: 'array', items: { type: 'string' }, description: 'Useful chunks/collocations the learner used correctly, if any.' },
    grammar: { type: 'string', description: 'One short sentence in Russian on grammatical accuracy.' },
    naturalness: { type: 'string', description: 'One short sentence in Russian on how natural the phrasing sounds to a native speaker.' },
    score: { type: 'number', minimum: 0, maximum: 1 },
    feedback: { type: 'string', description: 'One short sentence in Russian, the single most useful piece of feedback.' },
    suggestedAnswer: { type: 'string', description: 'A better-phrased version in English, or empty string if not applicable.' },
  },
  required: ['correctness', 'chunkUsage', 'grammar', 'naturalness', 'score', 'feedback', 'suggestedAnswer'],
} as const;

function anthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set — required for the anthropic grading provider.');
  return new Anthropic({ apiKey });
}

function model(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
}

async function callTool<T>(client: Anthropic, opts: { system: string; user: string; toolName: string; toolDescription: string; schema: unknown }): Promise<T> {
  const response = await client.messages.create({
    model: model(),
    max_tokens: 2048,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
    tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: opts.schema as Anthropic.Tool.InputSchema }],
    tool_choice: { type: 'tool', name: opts.toolName },
  });

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
  if (!toolUse) throw new Error('Anthropic response did not include the expected tool call.');
  return toolUse.input as T;
}

/** Scores the deterministic (multiple-choice) items locally — no need to ask
 * the model to re-grade something with one correct answer. Only free-text
 * ("write") items go to the LLM. */
function scoreChoiceItems(items: ExerciseItem[], answers: Record<number, string>): { correct: number; total: number } {
  let correct = 0;
  let total = 0;
  items.forEach((item, i) => {
    if (item.type !== 'choice') return;
    total += 1;
    if (answers[i] === item.answer) correct += 1;
  });
  return { correct, total };
}

export class AnthropicGradingProvider implements GradingProvider {
  name = 'anthropic';

  async gradePlacementTest(input: PlacementTestSubmission): Promise<PlacementGradeResult> {
    const client = anthropicClient();
    const mcqScore = scoreMcq(input.mcqAnswers);

    type ToolOutput = {
      openGrades: (GradeDetail & { n: number })[];
      essayGrade: GradeDetail;
      overallLevel: PlacementGradeResult['overallLevel'];
      skills: PlacementGradeResult['skills'];
      aboveLevel: string;
      belowLevel: string;
      topics: TopicSuggestion[];
    };

    const schema = {
      type: 'object',
      properties: {
        openGrades: {
          type: 'array',
          items: {
            type: 'object',
            properties: { n: { type: 'number' }, ...GRADE_DETAIL_SCHEMA.properties },
            required: ['n', ...GRADE_DETAIL_SCHEMA.required],
          },
        },
        essayGrade: GRADE_DETAIL_SCHEMA,
        overallLevel: { type: 'string', enum: ['A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'] },
        skills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              tag: { type: 'string', enum: ['A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'] },
              score: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['label', 'tag', 'score'],
          },
        },
        aboveLevel: { type: 'string', description: 'One short sentence in Russian.' },
        belowLevel: { type: 'string', description: 'One short sentence in Russian.' },
        topics: { type: 'array', items: TOPIC_SCHEMA, minItems: 8, maxItems: 12, description: 'Exactly around 10 concrete weak topics to study next, ordered by priority.' },
      },
      required: ['openGrades', 'essayGrade', 'overallLevel', 'skills', 'aboveLevel', 'belowLevel', 'topics'],
    };

    const user = [
      `Grade a CEFR English placement test for a Russian-speaking learner currently around ${input.fromLevel}, aiming for ${input.toLevel}, learning English for: ${input.purpose.join(', ') || '(not specified)'}.`,
      `The learner answered ${mcqScore.correct}/${mcqScore.total} multiple-choice grammar/vocabulary questions correctly (already scored, do not re-grade those).`,
      '',
      `Reading passage:\n"""${READING_PASSAGE}"""`,
      '',
      `Q${READING_QUESTIONS[0].n}. ${READING_QUESTIONS[0].q}\nAnswer: """${input.open9 || '(no answer)'}"""`,
      `Q${READING_QUESTIONS[1].n}. ${READING_QUESTIONS[1].q}\nAnswer: """${input.open10 || '(no answer)'}"""`,
      '',
      `Free writing prompt: "If you could move to another country next year, where would you go and why? What problems do you think you might face?"`,
      `Essay: """${input.essay || '(no answer)'}"""`,
      '',
      'Grade each open reading answer for comprehension correctness (not grammar — they answered in English but the point is whether they understood the passage). Grade the essay for grammar, natural phrasing, and range of constructions used at CEFR level. Use the multiple-choice score as strong signal for the "Грамматика" skill bar. Produce an overall CEFR level, four skill bars (Грамматика, Чтение и понимание, Лексика и чанки, Письмо), one sentence on what is above the overall level, one sentence on what pulls it down, and a personalized study plan of around 10 concrete topics (grammar points, lexical chunks, skills) worth studying next given this learner\'s level, goal, and purpose — each with a short kebab-case key, a Russian title, a category, and a one-sentence rationale grounded in something specific from this test. All prose fields must be in Russian except suggestedAnswer/chunkUsage which are English.',
    ].join('\n');

    const out = await callTool<ToolOutput>(client, {
      system: 'You are an expert CEFR English examiner grading a Russian-speaking learner and building them a personalized study plan. Be precise, concise, and encouraging. Always respond only via the provided tool.',
      user,
      toolName: 'submit_placement_grade',
      toolDescription: 'Submit the structured grade and study plan for a CEFR placement test.',
      schema,
    });

    const openGrades: Record<number, GradeDetail> = {};
    for (const g of out.openGrades) {
      const { n, ...rest } = g;
      openGrades[n] = rest;
    }

    return {
      overallLevel: out.overallLevel,
      skills: out.skills,
      aboveLevel: out.aboveLevel,
      belowLevel: out.belowLevel,
      mcqScore,
      openGrades,
      essayGrade: out.essayGrade,
      topics: out.topics,
    };
  }

  async gradeExercises(input: ExercisesSubmission): Promise<ExercisesGradeResult> {
    const client = anthropicClient();
    const choiceScore = scoreChoiceItems(input.items, input.answers);
    const writeItems = input.items
      .map((item, i) => ({ item, i }))
      .filter((x): x is { item: Extract<ExerciseItem, { type: 'write' }>; i: number } => x.item.type === 'write');

    type ToolOutput = {
      writeGrades: (GradeDetail & { itemIndex: number })[];
      notes: string[];
      discoveredTopics: TopicSuggestion[];
    };

    const schema = {
      type: 'object',
      properties: {
        writeGrades: {
          type: 'array',
          items: {
            type: 'object',
            properties: { itemIndex: { type: 'number' }, ...GRADE_DETAIL_SCHEMA.properties },
            required: ['itemIndex', ...GRADE_DETAIL_SCHEMA.required],
          },
        },
        notes: { type: 'array', items: { type: 'string' }, description: '2-3 short Russian sentences on patterns noticed across the answers.' },
        discoveredTopics: {
          type: 'array',
          items: TOPIC_SCHEMA,
          maxItems: 3,
          description: 'New weak spots noticed in THESE answers that are clearly different from the topic being tested (e.g. wrong article usage while testing modals) — empty array if none.',
        },
      },
      required: ['writeGrades', 'notes', 'discoveredTopics'],
    };

    const user = [
      `Topic being tested: "${input.topic.title}" (${input.topic.category}). ${input.topic.rationale}`,
      'Grade each free-text answer below for correctness, grammar, and natural phrasing at the appropriate CEFR level.',
      '',
      ...writeItems.map(({ item, i }) => `[#${i}] Q: ${item.q}\nA: """${input.answers[i] || '(no answer)'}"""`),
      '',
      'Also list 2-3 short notes in Russian on patterns you noticed (grammar mistakes, articles, word order, etc.), and separately flag any NEW weak topics visible in these answers that are clearly different from the topic being tested.',
    ].join('\n\n');

    const out = writeItems.length
      ? await callTool<ToolOutput>(client, {
          system: 'You are an expert CEFR English tutor grading exercise answers for a Russian-speaking learner. Always respond only via the provided tool.',
          user,
          toolName: 'submit_exercise_grade',
          toolDescription: 'Submit structured grades for free-text exercise answers.',
          schema,
        })
      : { writeGrades: [], notes: [], discoveredTopics: [] };

    const writeCorrect = out.writeGrades.reduce((sum, g) => sum + g.score, 0);
    const totalCorrect = choiceScore.correct + writeCorrect;
    const totalPossible = choiceScore.total + writeItems.length || 1;
    const scoreOutOf10 = Math.round((totalCorrect / totalPossible) * 10);

    return {
      scoreOutOf10,
      passed: scoreOutOf10 >= 7,
      verdictLabel: verdictFor(scoreOutOf10),
      notes: out.notes,
      discoveredTopics: out.discoveredTopics,
      nextReviewInDays: 3,
    };
  }

  async generateTopicStudy(topic: TopicSuggestion): Promise<TopicStudyContent> {
    const client = anthropicClient();

    const schema = {
      type: 'object',
      properties: {
        explanation: { type: 'string', description: '2-4 sentences in Russian explaining the topic clearly, at an appropriate level.' },
        keyPoints: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5, description: 'Short Russian bullet points, the essential rules.' },
        contrastExamples: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            properties: { wrong: { type: 'string' }, right: { type: 'string' } },
            required: ['wrong', 'right'],
          },
          description: 'English sentence pairs: a common mistake vs the correct version, illustrating this exact topic.',
        },
        exampleChunks: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5, description: 'Useful English chunks/collocations tied to this topic.' },
      },
      required: ['explanation', 'keyPoints', 'contrastExamples', 'exampleChunks'],
    };

    return callTool<TopicStudyContent>(client, {
      system: 'You are an expert English teacher writing concise study material in Russian for a Russian-speaking learner. Always respond only via the provided tool.',
      user: `Write study material for this topic: "${topic.title}" (category: ${topic.category}). Context for why the learner needs it: ${topic.rationale}`,
      toolName: 'submit_topic_study',
      toolDescription: 'Submit structured study material for one topic.',
      schema,
    });
  }

  async generateTopicExercises(topic: TopicSuggestion): Promise<ExerciseItem[]> {
    const client = anthropicClient();

    type ToolOutput = {
      items: { type: 'choice' | 'write'; q: string; options?: string[]; answer?: string; rows?: number; placeholder?: string }[];
    };

    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: 5,
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['choice', 'write'] },
              q: { type: 'string', description: 'The question, in Russian or English as appropriate.' },
              options: { type: 'array', items: { type: 'string' }, description: 'Only for type=choice — 3-4 options.' },
              answer: { type: 'string', description: 'Only for type=choice — must exactly match one of options.' },
              rows: { type: 'number', description: 'Only for type=write — suggested textarea rows, 2-6.' },
              placeholder: { type: 'string', description: 'Only for type=write — short English placeholder, e.g. "Your answer".' },
            },
            required: ['type', 'q'],
          },
          description: 'A mix of multiple-choice and free-text exercises drilling this exact topic. Vary the phrasing each time so a repeated attempt is not identical.',
        },
      },
      required: ['items'],
    };

    const out = await callTool<ToolOutput>(client, {
      system: 'You are an expert English teacher writing a short practice quiz for a Russian-speaking learner. Always respond only via the provided tool.',
      user: `Write 5-8 practice exercises drilling this exact topic: "${topic.title}" (category: ${topic.category}). Context: ${topic.rationale}`,
      toolName: 'submit_topic_exercises',
      toolDescription: 'Submit a structured practice quiz for one topic.',
      schema,
    });

    return out.items.map((item): ExerciseItem =>
      item.type === 'choice'
        ? { type: 'choice', q: item.q, options: item.options ?? [], answer: item.answer ?? '' }
        : { type: 'write', q: item.q, rows: item.rows ?? 3, placeholder: item.placeholder ?? 'Your answer' },
    );
  }
}

function verdictFor(scoreOutOf10: number): string {
  if (scoreOutOf10 >= 9) return 'Отлично';
  if (scoreOutOf10 >= 7) return 'Хорошо';
  if (scoreOutOf10 >= 5) return 'Неплохо';
  return 'Стоит повторить';
}
