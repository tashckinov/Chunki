import { READING_QUESTIONS } from '@app/shared';
import type {
  ExercisesGradeResult,
  ExercisesSubmission,
  GradeDetail,
  GradingProvider,
  PlacementGradeResult,
  PlacementTestSubmission,
} from '@app/shared';
import { scoreExerciseChoices, scoreMcq, writeItemsOf } from './scoring.js';

/**
 * Deterministic, no-network grader. Used for local dev and tests so the app is
 * fully runnable without an LLM API key. Heuristics are intentionally simple —
 * this is a stand-in for AnthropicGradingProvider, not a scoring model.
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
      weakTopicKeys: grammarScore < 0.6 ? ['articles', 'conditionals'] : [],
    };
  }

  async gradeExercises(input: ExercisesSubmission): Promise<ExercisesGradeResult> {
    const choiceScores = scoreExerciseChoices(input);
    const writeItems = writeItemsOf(input);
    const writeGrades = writeItems.map((w) => ({ ...w, grade: gradeFreeText(w.answer, 12) }));

    const blockScores = choiceScores.map((cs) => {
      const writesInBlock = writeGrades.filter((w) => w.blockKey === cs.blockKey);
      const writeCorrect = writesInBlock.reduce((sum, w) => sum + w.grade.score, 0);
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
      notes: ['Мок-проверка: качественные заметки появятся при использовании LLM-провайдера.'],
      weakTopicKeys: scoreOutOf10 < 7 ? ['articles'] : [],
      nextReviewInDays: 3,
    };
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

function labelForBlock(blockKey: string): string {
  const map: Record<string, string> = {
    comprehension: 'Понимание',
    grammar: 'Грамматика',
    'use-of-english': 'Use of English',
    writing: 'Письмо',
  };
  return map[blockKey] ?? blockKey;
}
