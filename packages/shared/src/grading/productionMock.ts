import type { ProductionCheckInput, ProductionCheckResult, ProductionJudgeProvider } from '../types.js';

/**
 * Deterministic, no-network judge — used for local dev/tests and wherever a
 * real OPENROUTER_API_KEY isn't configured. Heuristics are intentionally
 * simple, same spirit as MockGradingProvider: a stand-in for a real LLM
 * judge, not a serious evaluator.
 */
export class MockProductionJudgeProvider implements ProductionJudgeProvider {
  name = 'mock';
  model = 'mock';

  async judgeProduction(input: ProductionCheckInput): Promise<ProductionCheckResult> {
    const answer = input.userAnswer.trim();
    const words = answer ? answer.split(/\s+/) : [];

    if (words.length < 2) {
      return { isAppropriate: false, usedChunkId: null, feedback: 'Мок-проверка: ответ слишком короткий, чтобы понять, что вы имели в виду.' };
    }

    const normalizedAnswer = answer.toLowerCase();
    const used = input.candidateChunks.find((c) => normalizedAnswer.includes(c.text.toLowerCase()));
    if (used) {
      return { isAppropriate: true, usedChunkId: used.id, feedback: `Мок-проверка: вы использовали «${used.text}» — отлично!` };
    }

    return {
      isAppropriate: true,
      usedChunkId: null,
      feedback: 'Мок-проверка: смысл понятен, но ни одна из известных фраз в ответе не встретилась.',
    };
  }
}
