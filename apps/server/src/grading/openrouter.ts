import OpenAI from 'openai';
import { Ajv } from 'ajv';
import { scoreMcq } from '@app/shared';
import type { Env } from '../config/env.js';
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
import { BUILTIN_PLACEMENT_TEST } from '@app/shared';

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

const validator = new Ajv();

interface ToolRequest {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
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

export class OpenRouterGradingProvider implements GradingProvider {
  readonly name = 'openrouter';
  readonly model: string;

  constructor(private readonly env: Pick<Env, 'OPENROUTER_API_KEY' | 'OPENROUTER_GRADING_MODEL'>) {
    this.model = env.OPENROUTER_GRADING_MODEL;
  }

  async #callTool<T>(request: ToolRequest): Promise<T> {
    const apiKey = this.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for grammar grading.');
    const client = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1', maxRetries: 0, timeout: 45_000 });
    const options: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & { provider: { require_parameters: boolean } } = {
      model: this.model,
      max_tokens: request.maxTokens ?? 2048,
      provider: { require_parameters: true },
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      tools: [{ type: 'function', function: {
        name: request.toolName,
        description: request.toolDescription,
        parameters: request.schema,
      } }],
      tool_choice: { type: 'function', function: { name: request.toolName } },
    };

    let response;
    try {
      response = await client.chat.completions.create(options);
    } catch (error) {
      if (!(error instanceof OpenAI.APIError)) throw error;
      throw new Error(`OpenRouter grammar request failed (model=${this.model}, tool=${request.toolName}, status=${error.status ?? 'connection'}, type=${error.name})`);
    }
    const choice = response.choices?.[0];
    const tool = choice?.message?.tool_calls?.find((call) => call.type === 'function' && call.function.name === request.toolName);
    if (choice?.finish_reason === 'length' || !tool) {
      throw new Error(`OpenRouter grammar response missing a complete tool call (model=${this.model}, tool=${request.toolName}, finish_reason=${choice?.finish_reason ?? 'unknown'})`);
    }

    let output: unknown;
    try {
      output = JSON.parse(tool.function.arguments);
    } catch {
      throw new Error(`OpenRouter grammar response contained invalid JSON (model=${this.model}, tool=${request.toolName})`);
    }
    const valid = validator.validate(request.schema, output);
    const issue = validator.errors?.[0];
    validator.removeSchema(request.schema);
    if (!valid) {
      throw new Error(`OpenRouter grammar response failed validation (model=${this.model}, tool=${request.toolName}, field=${issue?.instancePath || '/'}, rule=${issue?.keyword ?? 'unknown'})`);
    }
    return output as T;
  }

  async gradePlacementTest(input: PlacementTestSubmission, definition = BUILTIN_PLACEMENT_TEST): Promise<PlacementGradeResult> {
    const mcqScore = scoreMcq(input.mcqAnswers, definition.mcq);

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
          minItems: definition.readingQuestions.length,
          maxItems: definition.readingQuestions.length,
          items: {
            type: 'object',
            properties: { n: { type: 'integer', enum: definition.readingQuestions.map(({ n }) => n) }, ...GRADE_DETAIL_SCHEMA.properties },
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
      `Grade a CEFR English placement test for a Russian-speaking learner ${input.fromLevel ? `who estimates their current level at ${input.fromLevel}` : 'who does not know their current level'}, aiming for ${input.toLevel}, learning English for: ${input.purpose.join(', ') || '(not specified)'}.`,
      `The learner answered ${mcqScore.correct}/${mcqScore.total} multiple-choice grammar/vocabulary questions correctly (already scored, do not re-grade those).`,
      '',
      `Reading passage:\n"""${definition.readingPassage}"""`,
      '',
      `Q${definition.readingQuestions[0].n}. ${definition.readingQuestions[0].q}\nAnswer: """${input.open9 || '(no answer)'}"""`,
      `Q${definition.readingQuestions[1].n}. ${definition.readingQuestions[1].q}\nAnswer: """${input.open10 || '(no answer)'}"""`,
      '',
      `Free writing prompt: "${definition.essayPrompt}"`,
      `Essay: """${input.essay || '(no answer)'}"""`,
      '',
      'Grade each open reading answer for comprehension correctness (not grammar — they answered in English but the point is whether they understood the passage). Grade the essay for grammar, natural phrasing, and range of constructions used at CEFR level. Use the multiple-choice score as strong signal for the "Грамматика" skill bar. Produce an overall CEFR level, four skill bars (Грамматика, Чтение и понимание, Лексика и чанки, Письмо), one sentence on what is above the overall level, one sentence on what pulls it down, and a personalized study plan of around 10 concrete topics (grammar points, lexical chunks, skills) worth studying next given this learner\'s level, goal, and purpose — each with a short kebab-case key, a Russian title, a category, and a one-sentence rationale grounded in something specific from this test. For every incomplete or incorrect reading answer, explain what was missed and give a correct example. In the writing feedback and grammar fields, quote the learner’s concrete mistakes and explain the corrections. In suggestedAnswer, preserve their meaning and correct the wording, or repeat the original if it needs no correction. All prose fields must be in Russian except suggestedAnswer/chunkUsage which are English.',
    ].join('\n');

    const out = await this.#callTool<ToolOutput>({
      system: 'You are an expert CEFR English examiner grading a Russian-speaking learner and building them a personalized study plan. Be precise, concise, and encouraging. Always respond only via the provided tool.',
      user,
      toolName: 'submit_placement_grade',
      maxTokens: 4096,
      toolDescription: 'Submit the structured grade and study plan for a CEFR placement test.',
      schema,
    });

    const openGrades: Record<number, GradeDetail> = {};
    for (const g of out.openGrades) {
      const { n, ...rest } = g;
      openGrades[n] = rest;
    }

    if (Object.keys(openGrades).length !== definition.readingQuestions.length) {
      throw new Error('OpenRouter grammar assessment returned duplicate reading grades.');
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
          minItems: writeItems.length,
          maxItems: writeItems.length,
          items: {
            type: 'object',
            properties: { itemIndex: { type: 'integer', enum: writeItems.map(({ i }) => i) }, ...GRADE_DETAIL_SCHEMA.properties },
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
      ? await this.#callTool<ToolOutput>({
          system: 'You are an expert CEFR English tutor grading exercise answers for a Russian-speaking learner. Always respond only via the provided tool.',
          user,
          toolName: 'submit_exercise_grade',
          maxTokens: 4096,
          toolDescription: 'Submit structured grades for free-text exercise answers.',
          schema,
        })
      : { writeGrades: [], notes: [], discoveredTopics: [] };

    if (new Set(out.writeGrades.map(({ itemIndex }) => itemIndex)).size !== writeItems.length) {
      throw new Error('OpenRouter grammar assessment returned duplicate exercise grades.');
    }
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
    const schema = {
      type: 'object',
      properties: {
        explanation: { type: 'string', description: 'A concise Russian lesson in ChatMD.' },
        keyPoints: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Additional short Russian rules, or an empty array.' },
        contrastExamples: {
          type: 'array',
          maxItems: 4,
          items: {
            type: 'object',
            properties: { wrong: { type: 'string' }, right: { type: 'string' } },
            required: ['wrong', 'right'],
          },
          description: 'Additional English mistake/correction pairs, or an empty array.',
        },
        exampleChunks: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Additional English chunks, or an empty array.' },
      },
      required: ['explanation', 'keyPoints', 'contrastExamples', 'exampleChunks'],
    };

    return this.#callTool<TopicStudyContent>({
      system: 'You are an expert English teacher writing concise study material in Russian for a Russian-speaking learner. Always respond only via the provided tool.',
      user: [
        `Topic: "${topic.title}" (${topic.category}). Learner context: ${topic.rationale}`,
        'Use Markdown in explanation, without HTML. Optional ChatMD blocks use :::tip (rule), :::note (clarification), :::example (example with translation or explanation), :::compare (two lines: wrong: … and right: …), or :::question. Put each marker on its own line and close with :::. Do not nest blocks.',
        'Use blocks only when useful. Usually 1–2 questions near the relevant rule suffice. Each needs a prompt, exactly one + option, at least one - option, and specific Russian feedback for every option:',
        ':::question\nI bought ___ book yesterday. Ты впервые упоминаешь книгу.\n+ a | Книга упоминается впервые.\n- the | Так говорят, если собеседник уже знает, о какой книге речь.\n:::',
        'Use the other fields only for material that adds to the lesson.',
      ].join('\n'),
      toolName: 'submit_topic_study',
      toolDescription: 'Submit structured study material for one topic.',
      schema,
    });
  }

  async generateTopicExercises(topic: TopicSuggestion): Promise<ExerciseItem[]> {

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

    const out = await this.#callTool<ToolOutput>({
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
