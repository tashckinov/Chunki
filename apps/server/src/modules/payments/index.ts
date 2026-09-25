import { loadEnv } from '../../config/env.js';
import { LavaTopPaymentProvider, MockPaymentProvider, type PaymentProvider } from './provider.js';

let cached: PaymentProvider | null = null;

// Same explicit-override / auto-select-when-a-key-is-present shape as
// openrouter/index.ts's getProductionJudgeProvider.
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const env = loadEnv();
  const explicit = env.PAYMENT_PROVIDER;
  const hasApiKey = !!env.LAVA_TOP_API_KEY;
  const isProd = env.NODE_ENV === 'production';

  const useLavaTop = explicit ? explicit === 'lava_top' : isProd || hasApiKey;

  cached = useLavaTop ? new LavaTopPaymentProvider(env) : new MockPaymentProvider(env.FRONTEND_URL);
  return cached;
}
