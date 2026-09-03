import { OAuth2Client, CodeChallengeMethod, type GenerateAuthUrlOpts } from 'google-auth-library';
import { loadEnv } from '../../config/env.js';

const SCOPES = ['openid', 'email', 'profile'];

function client(): OAuth2Client {
  const env = loadEnv();
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export async function generatePkcePair(): Promise<PkcePair> {
  const { codeVerifier, codeChallenge } = await client().generateCodeVerifierAsync();
  if (!codeChallenge) throw new Error('Failed to generate PKCE code_challenge');
  return { codeVerifier, codeChallenge };
}

export function buildGoogleAuthUrl(params: { state: string; nonce: string; codeChallenge: string }): string {
  // `nonce` isn't in the library's typed options but Google's endpoint
  // accepts it and google-auth-library passes unknown properties through
  // verbatim (it just querystring-encodes whatever object it's given).
  const opts: GenerateAuthUrlOpts & { nonce: string } = {
    response_type: 'code',
    access_type: 'online',
    scope: SCOPES,
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: 'select_account',
  };
  return client().generateAuthUrl(opts);
}

export interface VerifiedGoogleProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  /** Google's verified profile picture URL — read here, never persisted. */
  imageUrl: string | null;
  nonce: string | null;
}

/**
 * Exchanges the authorization code for tokens (with PKCE) and verifies the
 * ID token's signature, issuer, and audience via google-auth-library — we
 * never hand-roll JWT verification. Nonce is returned for the caller to
 * compare against the value it generated (this library doesn't validate
 * nonce itself, since it's an application-chosen value).
 */
export async function exchangeGoogleCode(params: { code: string; codeVerifier: string }): Promise<VerifiedGoogleProfile> {
  const oauth2 = client();
  const { tokens } = await oauth2.getToken({ code: params.code, codeVerifier: params.codeVerifier });
  if (!tokens.id_token) throw new Error('Google token response did not include an id_token');

  const ticket = await oauth2.verifyIdToken({ idToken: tokens.id_token, audience: loadEnv().GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub) throw new Error('Google ID token payload is missing a subject claim');

  return {
    providerUserId: payload.sub,
    email: payload.email ?? null,
    emailVerified: !!payload.email_verified,
    displayName: payload.name ?? null,
    imageUrl: payload.picture ?? null,
    nonce: payload.nonce ?? null,
  };
}
