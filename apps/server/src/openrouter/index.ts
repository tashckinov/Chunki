import { MockProductionJudgeProvider } from '@app/shared';
import type { ProductionJudgeProvider } from '@app/shared';
import { loadEnv } from '../config/env.js';
import { OpenRouterProductionJudgeProvider } from './openrouter.js';

let cached: ProductionJudgeProvider | null = null;

export function getProductionJudgeProvider(): ProductionJudgeProvider {
  if (cached) return cached;

  const env = loadEnv();
  const explicit = env.PRODUCTION_JUDGE_PROVIDER;
  const hasApiKey = !!env.OPENROUTER_API_KEY;
  const isProd = env.NODE_ENV === 'production';

  const useOpenRouter = explicit ? explicit === 'openrouter' : isProd || hasApiKey;

  cached = useOpenRouter ? new OpenRouterProductionJudgeProvider(env) : new MockProductionJudgeProvider();
  return cached;
}
