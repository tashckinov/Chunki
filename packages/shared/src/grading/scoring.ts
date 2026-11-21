import { MCQ } from '../content.js';
import type { McqQuestion, PlacementTestSubmission } from '../types.js';

export function scoreMcq(mcqAnswers: PlacementTestSubmission['mcqAnswers'], questions: McqQuestion[] = MCQ): { correct: number; total: number } {
  let correct = 0;
  for (const q of questions) {
    if (mcqAnswers[q.n] === q.correct) correct += 1;
  }
  return { correct, total: questions.length };
}
