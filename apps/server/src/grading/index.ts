import { MockGradingProvider } from '@app/shared';
import type { GradingProvider } from '@app/shared';
import { loadEnv } from '../config/env.js';
import { OpenRouterGradingProvider } from './openrouter.js';

let cached: GradingProvider | null = null;

// Same explicit-override / auto-select-when-a-key-is-present shape as
// openrouter/index.ts's getProductionJudgeProvider and payments/index.ts's
// getPaymentProvider.
export function getGradingProvider(): GradingProvider {
  if (cached) return cached;

  const env = loadEnv();
  const useOpenRouter = env.GRADING_PROVIDER !== 'mock'
    && (env.GRADING_PROVIDER !== undefined || env.NODE_ENV === 'production' || !!env.OPENROUTER_API_KEY);

  cached = useOpenRouter ? new OpenRouterGradingProvider(env) : new MockGradingProvider();
  return cached;
}
