import Anthropic from '@anthropic-ai/sdk';
import { READING_PASSAGE, READING_QUESTIONS, scoreExerciseChoices, scoreMcq, writeItemsOf } from '@app/shared';
import type {
  ExercisesGradeResult,
  ExercisesSubmission,
  GradeDetail,
  GradingProvider,
  PlacementGradeResult,
  PlacementTestSubmission,
} from '@app/shared';

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
      weakTopicKeys: string[];
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
        weakTopicKeys: {
          type: 'array',
          items: { type: 'string', enum: ['articles', 'modals', 'conditionals', 'word-order', 'listening'] },
        },
      },
      required: ['openGrades', 'essayGrade', 'overallLevel', 'skills', 'aboveLevel', 'belowLevel', 'weakTopicKeys'],
    };

    const user = [
      `Grade a CEFR English placement test. The learner answered ${mcqScore.correct}/${mcqScore.total} multiple-choice grammar/vocabulary questions correctly (already scored, do not re-grade those).`,
      '',
      `Reading passage:\n"""${READING_PASSAGE}"""`,
      '',
      `Q${READING_QUESTIONS[0].n}. ${READING_QUESTIONS[0].q}\nAnswer: """${input.open9 || '(no answer)'}"""`,
      `Q${READING_QUESTIONS[1].n}. ${READING_QUESTIONS[1].q}\nAnswer: """${input.open10 || '(no answer)'}"""`,
      '',
      `Free writing prompt: "If you could move to another country next year, where would you go and why? What problems do you think you might face?"`,
      `Essay: """${input.essay || '(no answer)'}"""`,
      '',
      'Grade each open reading answer for comprehension correctness (not grammar — they answered in English but the point is whether they understood the passage). Grade the essay for grammar, natural phrasing, and range of constructions used at CEFR level. Use the multiple-choice score as strong signal for the "Грамматика" skill bar. Produce an overall CEFR level, four skill bars (Грамматика, Чтение и понимание, Лексика и чанки, Письмо), one sentence on what is above the overall level, one sentence on what pulls it down, and which of these follow-up topics (if any) look weak enough to recommend as extra lessons: articles, modals, conditionals, word-order, listening. All prose fields must be in Russian except suggestedAnswer/chunkUsage which are English.',
    ].join('\n');

    const out = await callTool<ToolOutput>(client, {
      system: 'You are an expert CEFR English examiner grading a Russian-speaking B1-ish learner. Be precise, concise, and encouraging. Always respond only via the provided tool.',
      user,
      toolName: 'submit_placement_grade',
      toolDescription: 'Submit the structured grade for a CEFR placement test.',
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
      weakTopicKeys: out.weakTopicKeys,
    };
  }

  async gradeExercises(input: ExercisesSubmission): Promise<ExercisesGradeResult> {
    const client = anthropicClient();
    const choiceScores = scoreExerciseChoices(input);
    const writeItems = writeItemsOf(input);

    type ToolOutput = {
      writeGrades: (GradeDetail & { blockKey: string; itemIndex: number })[];
      notes: string[];
      weakTopicKeys: string[];
    };

    const schema = {
      type: 'object',
      properties: {
        writeGrades: {
          type: 'array',
          items: {
            type: 'object',
            properties: { blockKey: { type: 'string' }, itemIndex: { type: 'number' }, ...GRADE_DETAIL_SCHEMA.properties },
            required: ['blockKey', 'itemIndex', ...GRADE_DETAIL_SCHEMA.required],
          },
        },
        notes: { type: 'array', items: { type: 'string' }, description: '2-3 short Russian sentences on patterns noticed across the answers.' },
        weakTopicKeys: { type: 'array', items: { type: 'string', enum: ['articles', 'modals', 'conditionals', 'word-order', 'listening'] } },
      },
      required: ['writeGrades', 'notes', 'weakTopicKeys'],
    };

    const user = [
      `Topic: "${input.topicTitle}".`,
      'Grade each free-text answer below for correctness, grammar, and natural phrasing at the appropriate CEFR level.',
      '',
      ...writeItems.map((w) => `[${w.blockKey}#${w.itemIndex}] Q: ${w.question}\nA: """${w.answer || '(no answer)'}"""`),
      '',
      'Also list 2-3 short notes in Russian on patterns you noticed (grammar mistakes, articles, word order, etc.), and flag which follow-up topics (articles, modals, conditionals, word-order, listening) look weak enough to recommend as extra lessons.',
    ].join('\n\n');

    const out = writeItems.length
      ? await callTool<ToolOutput>(client, {
          system: 'You are an expert CEFR English tutor grading exercise answers for a Russian-speaking learner. Always respond only via the provided tool.',
          user,
          toolName: 'submit_exercise_grade',
          toolDescription: 'Submit structured grades for free-text exercise answers.',
          schema,
        })
      : { writeGrades: [], notes: [], weakTopicKeys: [] };

    const blockScores = choiceScores.map((cs) => {
      const writesInBlock = out.writeGrades.filter((w) => w.blockKey === cs.blockKey);
      const writeCorrect = writesInBlock.reduce((sum, w) => sum + w.score, 0);
      const writeTotal = writesInBlock.length;
      return {
        label: labelForBlock(cs.blockKey),
        correct: cs.correct + writeCorrect,
        total: cs.total + writeTotal,
      };
    });

    const totalCorrect = blockScores.reduce((s, b) => s + b.correct, 0);
    const totalPossible = blockScores.reduce((s, b) => s + b.total, 0) || 1;
    const scoreOutOf10 = Math.round((totalCorrect / totalPossible) * 10);

    return {
      scoreOutOf10,
      verdictLabel: verdictFor(scoreOutOf10),
      blockScores,
      notes: out.notes,
      weakTopicKeys: out.weakTopicKeys,
      nextReviewInDays: 3,
    };
  }
}

function verdictFor(scoreOutOf10: number): string {
  if (scoreOutOf10 >= 9) return 'Отлично';
  if (scoreOutOf10 >= 7) return 'Хорошо';
  if (scoreOutOf10 >= 5) return 'Неплохо';
  return 'Стоит повторить';
}

function labelForBlock(blockKey: string): string {
  const map: Record<string, string> = {
    comprehension: 'Понимание',
    grammar: 'Грамматика',
    'use-of-english': 'Use of English',
    writing: 'Письмо',
  };
  return map[blockKey] ?? blockKey;
}
