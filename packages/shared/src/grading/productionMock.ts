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
      return { verdict: 'not_conveyed', feedback: 'Мок-проверка: ответ слишком короткий, чтобы понять, что вы имели в виду.' };
    }

    const normalizedAnswer = answer.toLowerCase();
    const normalizedChunk = input.chunkText.toLowerCase();
    if (normalizedAnswer.includes(normalizedChunk)) {
      return { verdict: 'chunk_used', feedback: `Мок-проверка: вы использовали «${input.chunkText}» — отлично!` };
    }

    return {
      verdict: 'meaning_only',
      feedback: `Мок-проверка: смысл понятен, но сама фраза «${input.chunkText}» в ответе не встретилась.`,
    };
  }
}
