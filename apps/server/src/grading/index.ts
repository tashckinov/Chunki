import { MockGradingProvider } from '@app/shared';
import type { GradingProvider } from '@app/shared';
import { loadEnv } from '../config/env.js';
import { AnthropicGradingProvider } from './anthropic.js';

let cached: GradingProvider | null = null;

// Same explicit-override / auto-select-when-a-key-is-present shape as
// openrouter/index.ts's getProductionJudgeProvider and payments/index.ts's
// getPaymentProvider.
export function getGradingProvider(): GradingProvider {
  if (cached) return cached;

  const env = loadEnv();
  const explicit = env.GRADING_PROVIDER;
  const hasApiKey = !!env.ANTHROPIC_API_KEY;
  const isProd = env.NODE_ENV === 'production';

  const useAnthropic = explicit ? explicit === 'anthropic' : isProd || hasApiKey;

  cached = useAnthropic ? new AnthropicGradingProvider(env) : new MockGradingProvider();
  return cached;
}
