import { EX_BLOCKS, MCQ } from '../content.js';
import type { ExercisesSubmission, PlacementTestSubmission } from '../types.js';

export function scoreMcq(mcqAnswers: PlacementTestSubmission['mcqAnswers']): { correct: number; total: number } {
  let correct = 0;
  for (const q of MCQ) {
    if (mcqAnswers[q.n] === q.correct) correct += 1;
  }
  return { correct, total: MCQ.length };
}

export function scoreExerciseChoices(submission: ExercisesSubmission): { blockKey: string; correct: number; total: number }[] {
  return submission.blockAnswers.map((blockAnswer) => {
    const block = EX_BLOCKS.find((b) => b.key === blockAnswer.blockKey);
    if (!block) return { blockKey: blockAnswer.blockKey, correct: 0, total: 0 };
    let correct = 0;
    let total = 0;
    block.items.forEach((item, i) => {
      if (item.type !== 'choice') return;
      total += 1;
      if (blockAnswer.choiceAnswers[i] === item.answer) correct += 1;
    });
    return { blockKey: blockAnswer.blockKey, correct, total };
  });
}

export function writeItemsOf(submission: ExercisesSubmission) {
  const out: { blockKey: string; itemIndex: number; question: string; answer: string }[] = [];
  for (const blockAnswer of submission.blockAnswers) {
    const block = EX_BLOCKS.find((b) => b.key === blockAnswer.blockKey);
    if (!block) continue;
    block.items.forEach((item, i) => {
      if (item.type !== 'write') return;
      out.push({ blockKey: blockAnswer.blockKey, itemIndex: i, question: item.q, answer: blockAnswer.writeAnswers[i] ?? '' });
    });
  }
  return out;
}
