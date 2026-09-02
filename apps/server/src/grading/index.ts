import type { GradingProvider } from '@app/shared';
import { MockGradingProvider } from './mock.js';
import { AnthropicGradingProvider } from './anthropic.js';

let cached: GradingProvider | null = null;

export function getGradingProvider(): GradingProvider {
  if (cached) return cached;

  const explicit = process.env.GRADING_PROVIDER;
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  const useAnthropic = explicit ? explicit === 'anthropic' : isProd || hasApiKey;

  cached = useAnthropic ? new AnthropicGradingProvider() : new MockGradingProvider();
  return cached;
}
