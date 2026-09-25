import { READING_QUESTIONS } from '../content.js';
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
} from '../types.js';
import { scoreMcq } from './scoring.js';

/**
 * Deterministic, no-network grader. Used for local dev/tests and for the static
 * demo build (no backend, e.g. GitHub Pages) so the app is fully clickable
 * without an LLM API key. Heuristics are intentionally simple — this is a
 * stand-in for a real LLM grading provider, not a scoring model.
 */
function gradeFreeText(answer: string, minWords: number): GradeDetail {
  const trimmed = answer.trim();
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const wordCount = words.length;

  if (wordCount === 0) {
    return {
      correctness: 'n/a',
      chunkUsage: [],
      grammar: 'Нет ответа для проверки.',
      naturalness: 'n/a',
      score: 0,
      feedback: 'Вы не дали ответ на этот вопрос.',
      suggestedAnswer: '',
    };
  }

  const correctness = wordCount >= minWords ? 'correct' : wordCount >= Math.ceil(minWords / 2) ? 'partial' : 'incorrect';
  const score = Math.max(0, Math.min(1, wordCount / (minWords * 1.5)));

  return {
    correctness,
    chunkUsage: [],
    grammar: wordCount >= minWords ? 'Похоже на связный ответ, грубых ошибок не выявлено (мок-проверка).' : 'Ответ короткий — грамматику трудно оценить (мок-проверка).',
    naturalness: correctness === 'correct' ? 'Звучит естественно.' : 'Можно развернуть ответ подробнее.',
    score,
    feedback: `Мок-проверка: ${wordCount} слов(а). Для реальной проверки подключите провайдера LLM.`,
    suggestedAnswer: '',
  };
}

/** Deterministic pool the mock provider draws "AI-discovered" topics from —
 * a real provider would invent these freely, this is just enough variety to
 * exercise the whole flow (program list, study, exercises) without a key. */
const MOCK_TOPIC_POOL: TopicSuggestion[] = [
  { key: 'articles', title: 'Артикли: a / the / нулевой', category: 'Грамматика', rationale: 'В открытых ответах артикли часто пропущены или лишние.' },
  { key: 'present-perfect', title: 'Present Perfect vs Past Simple', category: 'Грамматика', rationale: 'Past Simple используется там, где нужен Present Perfect.' },
  { key: 'word-order', title: 'Порядок слов и наречия частоты', category: 'Использование языка', rationale: 'Наречия частоты стоят не на своём месте в предложении.' },
  { key: 'conditionals-2', title: 'Второй тип условных', category: 'Грамматика', rationale: 'Условные конструкции второго типа вызывают ошибки.' },
  { key: 'modals', title: 'Модальные глаголы вероятности', category: 'Грамматика', rationale: 'Модальные глаголы для вероятности путаются между собой.' },
  { key: 'chunks-opinion', title: 'Chunks: мнение и согласие', category: 'Лексика', rationale: 'Не хватает устойчивых фраз для выражения мнения.' },
  { key: 'writing-informal', title: 'Письмо: неформальное сообщение', category: 'Письмо', rationale: 'Письменная речь звучит слишком формально для неформального контекста.' },
  { key: 'reading-long', title: 'Reading: длинный текст на время', category: 'Понимание', rationale: 'Понимание текста замедляется на длинных пассажах.' },
];

function pickTopics(count: number, seed: number): TopicSuggestion[] {
  return Array.from({ length: Math.min(count, MOCK_TOPIC_POOL.length) }, (_, i) => MOCK_TOPIC_POOL[(seed + i) % MOCK_TOPIC_POOL.length]);
}

export class MockGradingProvider implements GradingProvider {
  name = 'mock';

  async gradePlacementTest(input: PlacementTestSubmission): Promise<PlacementGradeResult> {
    const mcqScore = scoreMcq(input.mcqAnswers);
    const mcqRatio = mcqScore.correct / mcqScore.total;

    const openGrades: Record<number, GradeDetail> = {};
    openGrades[READING_QUESTIONS[0].n] = gradeFreeText(input.open9, 6);
    openGrades[READING_QUESTIONS[1].n] = gradeFreeText(input.open10, 6);
    const essayGrade = gradeFreeText(input.essay, 40);

    const grammarScore = mcqRatio;
    const writingScore = essayGrade.score;
    const readingScore = (openGrades[9].score + openGrades[10].score) / 2;
    const lexicalScore = (grammarScore + writingScore) / 2;

    const overallScore = (grammarScore + readingScore + lexicalScore + writingScore) / 4;
    const overallLevel = levelFromScore(overallScore);

    return {
      overallLevel,
      skills: [
        { label: 'Грамматика', tag: levelFromScore(grammarScore), score: grammarScore },
        { label: 'Чтение и понимание', tag: levelFromScore(readingScore), score: readingScore },
        { label: 'Лексика и чанки', tag: levelFromScore(lexicalScore), score: lexicalScore },
        { label: 'Письмо', tag: levelFromScore(writingScore), score: writingScore },
      ],
      aboveLevel: readingScore > 0.6 ? 'Чтение и понимание смысла — сильная сторона.' : 'Пока нет явно сильных сторон по этому тесту.',
      belowLevel: grammarScore < 0.6 ? 'Грамматика и точность конструкций тянут уровень вниз.' : 'Заметных слабых мест не выявлено.',
      mcqScore,
      openGrades,
      essayGrade,
      topics: pickTopics(MOCK_TOPIC_POOL.length, mcqScore.correct),
    };
  }

  async gradeExercises(input: ExercisesSubmission): Promise<ExercisesGradeResult> {
    let correct = 0;
    let total = 0;
    const writeGrades: GradeDetail[] = [];

    input.items.forEach((item, i) => {
      const answer = input.answers[i] ?? '';
      if (item.type === 'choice') {
        total += 1;
        if (answer === item.answer) correct += 1;
      } else {
        const grade = gradeFreeText(answer, 8);
        writeGrades.push(grade);
        total += 1;
        correct += grade.score;
      }
    });

    const scoreOutOf10 = total > 0 ? Math.round((correct / total) * 10) : 0;

    return {
      scoreOutOf10,
      passed: scoreOutOf10 >= 7,
      verdictLabel: verdictFor(scoreOutOf10),
      notes: ['Мок-проверка: качественные заметки появятся при использовании LLM-провайдера.'],
      discoveredTopics: scoreOutOf10 < 6 ? pickTopics(1, input.topic.key.length) : [],
      nextReviewInDays: 3,
    };
  }

  async generateTopicStudy(topic: TopicSuggestion): Promise<TopicStudyContent> {
    return {
      explanation: `${topic.title} — мок-материал. ${topic.rationale} Для реального объяснения подключите провайдера LLM.`,
      keyPoints: ['Ключевой момент 1 (мок)', 'Ключевой момент 2 (мок)', 'Ключевой момент 3 (мок)'],
      contrastExamples: [{ wrong: 'Пример с ошибкой (мок).', right: 'Правильный вариант (мок).' }],
      exampleChunks: ['example chunk one', 'example chunk two'],
    };
  }

  async generateTopicExercises(topic: TopicSuggestion): Promise<ExerciseItem[]> {
    return [
      { type: 'choice', q: `[Мок] Вопрос по теме «${topic.title}» — вариант 1`, options: ['A', 'B', 'C'], answer: 'A' },
      { type: 'choice', q: `[Мок] Вопрос по теме «${topic.title}» — вариант 2`, options: ['A', 'B', 'C'], answer: 'B' },
      { type: 'write', q: `[Мок] Напиши предложение, используя «${topic.title}».`, rows: 2, placeholder: 'Your answer' },
    ];
  }
}

function levelFromScore(score: number): PlacementGradeResult['overallLevel'] {
  if (score >= 0.85) return 'B2';
  if (score >= 0.7) return 'B1+';
  if (score >= 0.55) return 'B1';
  if (score >= 0.4) return 'A2+';
  if (score >= 0.25) return 'A2';
  return 'A1';
}

function verdictFor(scoreOutOf10: number): string {
  if (scoreOutOf10 >= 9) return 'Отлично';
  if (scoreOutOf10 >= 7) return 'Хорошо';
  if (scoreOutOf10 >= 5) return 'Неплохо';
  return 'Стоит повторить';
}
