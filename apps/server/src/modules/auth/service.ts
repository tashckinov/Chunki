import { findOrCreateUserFromProvider } from '../users/service.js';
import { createSession } from './session.js';
import type { VerifiedGoogleProfile } from './google.js';

export interface LoginResult {
  token: string;
  expiresAt: Date;
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
