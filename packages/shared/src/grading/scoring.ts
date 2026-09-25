import { MCQ } from '../content.js';
import type { PlacementTestSubmission } from '../types.js';

export function scoreMcq(mcqAnswers: PlacementTestSubmission['mcqAnswers']): { correct: number; total: number } {
  let correct = 0;
  for (const q of MCQ) {
    if (mcqAnswers[q.n] === q.correct) correct += 1;
  }
  return { correct, total: MCQ.length };
}
