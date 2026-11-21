import type { PlacementGradeResult, PlacementReviewItem, PlacementTestDefinition, PlacementTestSubmission } from '@app/shared';

type Answers = Pick<PlacementTestSubmission, 'mcqAnswers' | 'open9' | 'open10' | 'essay'>;

export function buildPlacementReview(
  definition: PlacementTestDefinition,
  answers: Answers,
  grades: Pick<PlacementGradeResult, 'openGrades' | 'essayGrade'>,
): PlacementReviewItem[] {
  const letters = 'ABCD';
  const review: PlacementReviewItem[] = [];
  for (const { n, q, options, correct } of definition.mcq) {
    const answer = answers.mcqAnswers[n];
    if (answer === correct) continue;
    review.push({
      key: String(n), prompt: q, answer: answer ? options[letters.indexOf(answer)] ?? '' : '',
      correction: options[letters.indexOf(correct)],
    });
  }

  definition.readingQuestions.forEach(({ n, q }, index) => {
    const grade = grades.openGrades[n];
    if (!grade || grade.correctness === 'correct') return;
    review.push({
      key: String(n), prompt: q, answer: index === 0 ? answers.open9 : answers.open10,
      correction: grade.suggestedAnswer, feedback: grade.feedback,
    });
  });

  const essay = grades.essayGrade;
  // A full-score essay can still have specific corrections recorded by the examiner.
  if (essay.correctness !== 'correct' || (essay.suggestedAnswer && essay.suggestedAnswer.trim() !== answers.essay.trim())) {
    review.push({
      key: 'essay', prompt: definition.essayPrompt, answer: answers.essay,
      correction: essay.suggestedAnswer, feedback: essay.feedback, grammar: essay.grammar, naturalness: essay.naturalness,
    });
  }
  return review;
}
