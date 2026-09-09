import { findOrCreateUserFromProvider } from '../users/service.js';
import { createSession, getSession } from './session.js';
import { createUserWithCredential, updateCredentialCounter } from './webauthnCredentials.js';
import type { VerifiedGoogleProfile } from './google.js';
import type { VerifiedRegistration } from './webauthn.js';

export interface LoginResult {
  token: string;
  expiresAt: Date;
}

export interface PublicUser {
  id: string;
  email: string | null;
  displayName: string | null;
  imageUrl: string | null;
}

async function loginResultWithUser(token: string, expiresAt: Date): Promise<LoginResult & { user: PublicUser }> {
  // Re-read via getSession so the returned shape always matches /api/auth/me
  // exactly, rather than hand-assembling it separately here.
  const session = await getSession(token);
  if (!session) throw new Error('Session vanished immediately after being created');
  return {
    token,
    expiresAt,
    user: { id: session.userId, email: session.email, displayName: session.displayName, imageUrl: session.providerImageUrl },
  };
}

/**
 * Orchestrates "verified Google profile" -> "Chunki user" -> "session".
 * Keeps the Google-specific verification (google.ts) and the persisted
 * user/identity model (modules/users) from knowing about each other.
 */
export async function completeGoogleLogin(profile: VerifiedGoogleProfile): Promise<LoginResult> {
  const user = await findOrCreateUserFromProvider({
    provider: 'google',
    providerUserId: profile.providerUserId,
    email: profile.email,
    displayName: profile.displayName,
    // Google is also the identity provider here, so provider_email and the
    // user's stored email start out the same; they may diverge later if the
    // provider's email changes without us re-syncing it (not implemented).
    providerEmail: profile.email,
  });

  // The image URL is only ever kept on the session row — never on `users`.
  return createSession(user.id, profile.imageUrl);
}

/**
 * Passkey registration has no provider identity to find-or-create against —
 * it always creates a brand-new, otherwise-empty user bound to the new
 * credential (see webauthnCredentials.ts for why this bypasses
 * findOrCreateUserFromProvider entirely).
 */
export async function completeWebauthnRegistration(verified: VerifiedRegistration): Promise<LoginResult & { user: PublicUser }> {
  const user = await createUserWithCredential({
    credentialId: verified.credentialId,
    publicKey: verified.publicKey,
    counter: verified.counter,
    transports: verified.transports,
    deviceType: verified.deviceType,
    backedUp: verified.backedUp,
  });
  const { token, expiresAt } = await createSession(user.id, null);
  return loginResultWithUser(token, expiresAt);
}

export async function completeWebauthnLogin(userId: string, credentialId: string, newCounter: number): Promise<LoginResult & { user: PublicUser }> {
  await updateCredentialCounter(credentialId, newCounter);
  const { token, expiresAt } = await createSession(userId, null);
  return loginResultWithUser(token, expiresAt);
}
