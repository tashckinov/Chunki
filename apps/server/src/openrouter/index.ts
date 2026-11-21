import { MockProductionJudgeProvider } from '@app/shared';
import type { ProductionJudgeProvider } from '@app/shared';
import { loadEnv } from '../config/env.js';
import { OpenRouterProductionJudgeProvider } from './openrouter.js';

const productionModels = [
  'openai/gpt-5-nano',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash-lite',
  'anthropic/claude-haiku-4.5',
];

type ProductionJudge = ProductionJudgeProvider & { nextAttempts?: () => ProductionJudgeProvider[] };
let cached: ProductionJudge | null = null;

export function getProductionJudgeProvider(): ProductionJudge {
  if (cached) return cached;

  const env = loadEnv();
  const explicit = env.PRODUCTION_JUDGE_PROVIDER;
  const hasApiKey = !!env.OPENROUTER_API_KEY;
  const isProd = env.NODE_ENV === 'production';

  const useOpenRouter = explicit ? explicit === 'openrouter' : isProd || hasApiKey;

  if (useOpenRouter) {
    const judges = productionModels.map((model) => new OpenRouterProductionJudgeProvider(env.OPENROUTER_API_KEY, model));
    let next = 0;
    cached = Object.assign(judges[0], {
      nextAttempts() {
        const start = next;
        next = (next + 1) % judges.length;
        return [...judges.slice(start), ...judges.slice(0, start)];
      },
    });
  } else {
    cached = new MockProductionJudgeProvider();
  }
  return cached;
}
