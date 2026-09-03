import { createUserWithIdentity, findUserByProviderIdentity, touchLastLogin, type UserRow } from './repository.js';

/**
 * Verified identity claims from an OAuth/OIDC provider — never raw client
 * input. Callers (e.g. the Google auth flow) are responsible for verifying
 * signature/issuer/audience before this ever gets built.
 */
export interface ProviderProfile {
  provider: string;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  providerEmail: string | null;
}

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
}

/**
 * Finds the Chunki user for a verified provider identity, creating one if
 * this is the first time we've seen it. Identity is keyed strictly by
 * (provider, providerUserId) — never by email, which a provider may omit,
 * leave unverified, or change. Account linking across providers is
 * deliberately out of scope for now: a new provider identity always gets
 * its own user row rather than being merged into an existing one by email.
 */
export async function findOrCreateUserFromProvider(profile: ProviderProfile): Promise<UserRow> {
  const existing = await findUserByProviderIdentity(profile.provider, profile.providerUserId);
  if (existing) {
    const last_login_at = await touchLastLogin(existing.id);
    return { ...existing, last_login_at };
  }

  try {
    return await createUserWithIdentity({
      email: profile.email,
      displayName: profile.displayName,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      providerEmail: profile.providerEmail,
    });
  } catch (err) {
    // A concurrent request for the same identity won the race and inserted
    // first (UNIQUE(provider, provider_user_id)) — use that row instead of
    // failing the second request.
    if (isUniqueViolation(err)) {
      const winner = await findUserByProviderIdentity(profile.provider, profile.providerUserId);
      if (winner) {
        const last_login_at = await touchLastLogin(winner.id);
        return { ...winner, last_login_at };
      }
    }
    throw err;
  }
}
