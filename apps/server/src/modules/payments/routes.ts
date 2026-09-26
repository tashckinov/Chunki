import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { loadEnv } from '../../config/env.js';
import { requireAuthenticatedSession } from '../auth/requireAuth.js';
import { createCheckoutForUser, getAccountPaymentStatus, handleLavaTopWebhook } from './service.js';
import { listPublicTariffs } from '../subscriptionTariffs/service.js';

const checkoutBodySchema = z.object({
  tariffId: z.string().uuid(),
  currency: z.enum(['USD', 'EUR', 'RUB']),
  email: z.string().email().max(255),
});

/** HTTP Basic auth, checked against LAVA_TOP_WEBHOOK_LOGIN/PASSWORD — configured to match in Lava.top's dashboard under Интеграции → Webhook. Not the same secret as LAVA_TOP_API_KEY, which is this app's own outbound credential. */
function verifyLavaTopWebhookAuth(header: string | undefined): boolean {
  const env = loadEnv();
  const login = env.LAVA_TOP_WEBHOOK_LOGIN;
  const password = env.LAVA_TOP_WEBHOOK_PASSWORD;
  if (!login || !password) return false;
  if (!header?.startsWith('Basic ')) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  } catch {
    return false;
  }

  const expected = Buffer.from(`${login}:${password}`);
  const actual = Buffer.from(decoded);
  // timingSafeEqual throws on a length mismatch rather than returning false,
  // so unequal-length inputs are rejected before ever reaching it.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const paymentsRoutes: FastifyPluginAsync = async (app) => {
  // Applies to every route below, including the public webhook — /checkout
  // is throttled per signed-in user against spam-created invoices (mirrors
  // progress/routes.ts's identical treatment of its one paid/expensive
  // route), and /webhook/lava-top is throttled per IP since it carries no
  // session — otherwise it'd be the one route in this app where a Basic-auth
  // guess could be retried without limit.
  await app.register(rateLimit, { global: false });

  app.post(
    '/checkout',
    {
      preHandler: [
        requireAuthenticatedSession,
        app.rateLimit({ max: 10, timeWindow: '10 minutes', keyGenerator: (request) => request.session!.userId }),
      ],
    },
    async (request, reply) => {
      const parsed = checkoutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid_request' };
      }

      let result;
      try {
        result = await createCheckoutForUser(request.session!.userId, parsed.data.email, parsed.data.tariffId, parsed.data.currency);
      } catch (err) {
        request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'payment checkout creation failed');
        reply.code(502);
        return { error: 'provider_unavailable' };
      }

      if (result.kind === 'not_configured') {
        reply.code(409);
        return { error: 'not_configured' };
      }
      return { paymentUrl: result.paymentUrl };
    },
  );

  app.get('/status', { preHandler: requireAuthenticatedSession }, async (request) => {
    return getAccountPaymentStatus(request.session!.userId);
  });

  // Public — the checkout screen needs tariff titles/prices before the user
  // is necessarily still holding a valid session (e.g. right after login),
  // and this is read-only, non-sensitive display data. IP-keyed like the
  // other anonymous-hittable routes (chunks/random-dialogue, auth routes).
  app.get('/tariffs', { preHandler: app.rateLimit({ max: 30, timeWindow: '1 minute', keyGenerator: (request) => request.ip }) }, async () => {
    return { tariffs: await listPublicTariffs() };
  });

  // Public — called by Lava.top server-to-server, never carries a session
  // cookie, so the rate limit below is keyed by IP rather than userId. The
  // limit is generous (this is a legitimate webhook sender, not a user) but
  // still bounds how many Basic-auth guesses a single source can throw at
  // verifyLavaTopWebhookAuth per window.
  app.post(
    '/webhook/lava-top',
    { preHandler: app.rateLimit({ max: 60, timeWindow: '1 minute', keyGenerator: (request) => request.ip }) },
    async (request, reply) => {
      if (!verifyLavaTopWebhookAuth(request.headers.authorization)) {
        reply.code(401);
        return { error: 'unauthorized' };
      }

      try {
        await handleLavaTopWebhook(request.body as Record<string, unknown>);
      } catch (err) {
        request.log.error({ message: err instanceof Error ? err.message : String(err) }, 'Lava.top webhook handling failed');
        reply.code(502);
        return { error: 'processing_failed' };
      }
      return { ok: true };
    },
  );
};
