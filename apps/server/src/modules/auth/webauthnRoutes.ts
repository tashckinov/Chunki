import type { FastifyPluginAsync } from 'fastify';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { loadEnv } from '../../config/env.js';
import { buildRegistrationOptions, verifyRegistration, buildAuthenticationOptions, verifyAuthentication } from './webauthn.js';
import { findCredentialByCredentialId } from './webauthnCredentials.js';
import { completeWebauthnRegistration, completeWebauthnLogin } from './service.js';
import { SESSION_COOKIE_NAME } from './session.js';

const CHALLENGE_COOKIE_NAME = 'chunki_webauthn_challenge';
const CHALLENGE_COOKIE_MAX_AGE_SECONDS = 5 * 60;
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

interface ChallengeCookiePayload {
  type: 'register' | 'login';
  challenge: string;
}

/**
 * Registered inside authRoutes (see routes.ts), so it inherits the same
 * `/api/auth` prefix, CORS, and @fastify/cookie registration — nothing new
 * to wire up at the server-entry level.
 */
export const webauthnRoutes: FastifyPluginAsync = async (app) => {
  const env = loadEnv();
  const isProd = env.NODE_ENV === 'production';
  const cookieSameSite = isProd ? 'none' : 'lax';

  function setChallengeCookie(reply: import('fastify').FastifyReply, payload: ChallengeCookiePayload): void {
    reply.setCookie(CHALLENGE_COOKIE_NAME, JSON.stringify(payload), {
      signed: true,
      httpOnly: true,
      secure: isProd,
      sameSite: cookieSameSite,
      path: '/api/auth',
      maxAge: CHALLENGE_COOKIE_MAX_AGE_SECONDS,
    });
  }

  function readChallengeCookie(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply, expectedType: 'register' | 'login'): string | null {
    const raw = request.cookies[CHALLENGE_COOKIE_NAME];
    reply.clearCookie(CHALLENGE_COOKIE_NAME, { path: '/api/auth' });
    if (!raw) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return null;
    try {
      const payload = JSON.parse(unsigned.value) as ChallengeCookiePayload;
      return payload.type === expectedType ? payload.challenge : null;
    } catch {
      return null;
    }
  }

  function setSessionCookie(reply: import('fastify').FastifyReply, token: string, expiresAt: Date): void {
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: cookieSameSite,
      path: '/',
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
      expires: expiresAt,
    });
  }

  app.post('/webauthn/register/options', async (_request, reply) => {
    const options = await buildRegistrationOptions();
    setChallengeCookie(reply, { type: 'register', challenge: options.challenge });
    return { options };
  });

  app.post('/webauthn/register/verify', async (request, reply) => {
    const challenge = readChallengeCookie(request, reply, 'register');
    if (!challenge) {
      reply.code(400);
      return { error: 'no_pending_challenge' };
    }

    const verified = await verifyRegistration(request.body as RegistrationResponseJSON, challenge);
    if (!verified) {
      reply.code(400);
      return { error: 'registration_failed' };
    }

    const { token, expiresAt, user } = await completeWebauthnRegistration(verified);
    setSessionCookie(reply, token, expiresAt);
    return { token, user };
  });

  app.post('/webauthn/login/options', async (_request, reply) => {
    const options = await buildAuthenticationOptions();
    setChallengeCookie(reply, { type: 'login', challenge: options.challenge });
    return { options };
  });

  app.post('/webauthn/login/verify', async (request, reply) => {
    const challenge = readChallengeCookie(request, reply, 'login');
    if (!challenge) {
      reply.code(400);
      return { error: 'no_pending_challenge' };
    }

    const response = request.body as AuthenticationResponseJSON;
    const stored = await findCredentialByCredentialId(response.id);
    if (!stored) {
      reply.code(401);
      return { error: 'unknown_credential' };
    }

    const result = await verifyAuthentication(response, challenge, {
      id: stored.credentialId,
      publicKey: stored.publicKey,
      counter: stored.counter,
      transports: stored.transports,
    });
    if (!result) {
      reply.code(401);
      return { error: 'verification_failed' };
    }

    const { token, expiresAt, user } = await completeWebauthnLogin(stored.userId, stored.credentialId, result.newCounter);
    setSessionCookie(reply, token, expiresAt);
    return { token, user };
  });
};
