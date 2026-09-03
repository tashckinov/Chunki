import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { loadEnv } from '../../config/env.js';
import { buildGoogleAuthUrl, exchangeGoogleCode, generatePkcePair } from './google.js';
import { completeGoogleLogin } from './service.js';
import { SESSION_COOKIE_NAME, destroySession, getSession } from './session.js';

const OAUTH_COOKIE_NAME = 'chunki_oauth_state';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

interface OAuthCookiePayload {
  state: string;
  nonce: string;
  codeVerifier: string;
}

function logSafeError(err: unknown): string {
  // Never pass the raw error object to the logger: OAuth client errors can
  // carry the request body/headers (which include the client secret and
  // authorization code) on properties like `.config`. Only the message is
  // ever safe to record.
  return err instanceof Error ? err.message : String(err);
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const env = loadEnv();
  const isProd = env.NODE_ENV === 'production';
  // Production is a cross-site deployment (frontend on GitHub Pages, backend
  // on its own host) — cookies need SameSite=None (which browsers only send
  // over HTTPS, hence the paired `secure: isProd`). Dev keeps Lax, which is
  // enough for same-site localhost and doesn't require HTTPS.
  const cookieSameSite = isProd ? 'none' : 'lax';
  const frontendBase = env.FRONTEND_URL.replace(/\/+$/, '');

  app.get('/google', async (_request, reply) => {
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const { codeVerifier, codeChallenge } = await generatePkcePair();

    const payload: OAuthCookiePayload = { state, nonce, codeVerifier };
    reply.setCookie(OAUTH_COOKIE_NAME, JSON.stringify(payload), {
      signed: true,
      httpOnly: true,
      secure: isProd,
      sameSite: cookieSameSite,
      path: '/api/auth',
      maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    });

    return reply.redirect(buildGoogleAuthUrl({ state, nonce, codeChallenge }));
  });

  app.get('/google/callback', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const rawCookie = request.cookies[OAUTH_COOKIE_NAME];
    reply.clearCookie(OAUTH_COOKIE_NAME, { path: '/api/auth' });

    const failure = () => reply.redirect(`${frontendBase}/?auth_error=1`);

    if (query.error) {
      request.log.warn({ error: query.error }, 'Google returned an OAuth error');
      return failure();
    }
    if (!query.code || !query.state || !rawCookie) return failure();

    const unsigned = request.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) return failure();

    let stored: OAuthCookiePayload;
    try {
      stored = JSON.parse(unsigned.value) as OAuthCookiePayload;
    } catch {
      return failure();
    }

    // CSRF protection: the state we handed Google must come back unchanged.
    if (stored.state !== query.state) return failure();

    try {
      const profile = await exchangeGoogleCode({ code: query.code, codeVerifier: stored.codeVerifier });

      // Replay/injection protection for the ID token itself.
      if (!profile.nonce || profile.nonce !== stored.nonce) {
        request.log.warn('Google ID token nonce did not match');
        return failure();
      }

      const { token, expiresAt } = await completeGoogleLogin(profile);

      reply.setCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: cookieSameSite,
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
        expires: expiresAt,
      });

      return reply.redirect(frontendBase);
    } catch (err) {
      request.log.error({ message: logSafeError(err) }, 'Google auth callback failed');
      return failure();
    }
  });

  app.get('/me', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const session = token ? await getSession(token) : null;

    if (!session) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    return {
      user: {
        id: session.userId,
        email: session.email,
        displayName: session.displayName,
        imageUrl: session.providerImageUrl,
      },
    };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) await destroySession(token);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  });
};
