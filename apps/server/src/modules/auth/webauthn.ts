import { randomBytes } from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { loadEnv } from '../../config/env.js';

/**
 * The frontend (GitHub Pages) and this backend live on unrelated domains —
 * the RP ID must be the domain where navigator.credentials.create()/.get()
 * actually runs, i.e. the frontend's origin, never this server's own host.
 * CORS_ORIGIN is already exactly that: the bare frontend origin, no path —
 * see routes.ts's cookie comments — so it's reused here instead of adding a
 * dedicated env var. `localhost` (dev) is spec-valid as an RP ID.
 */
function rpConfig(): { rpID: string; rpName: string; origin: string } {
  const env = loadEnv();
  return { rpID: new URL(env.CORS_ORIGIN).hostname, rpName: 'Chunki', origin: env.CORS_ORIGIN };
}

export async function buildRegistrationOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID, rpName } = rpConfig();
  return generateRegistrationOptions({
    rpName,
    rpID,
    userName: 'Chunki user',
    userID: randomBytes(16),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
}

export interface VerifiedRegistration {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[] | null;
  deviceType: string;
  backedUp: boolean;
}

export async function verifyRegistration(response: RegistrationResponseJSON, expectedChallenge: string): Promise<VerifiedRegistration | null> {
  const { rpID, origin } = rpConfig();
  const result = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID });
  if (!result.verified || !result.registrationInfo) return null;

  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  return {
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? null,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  };
}

export async function buildAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = rpConfig();
  // allowCredentials intentionally omitted: this is the usernameless/
  // discoverable-credential flow — the platform shows its own picker
  // without us telling it which credential to expect.
  return generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
}

export interface StoredCredential {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  stored: StoredCredential,
): Promise<{ newCounter: number } | null> {
  const { rpID, origin } = rpConfig();
  // .slice() (not .subarray()) copies into a plain ArrayBuffer-backed
  // Uint8Array — matches the library's own Uint8Array_ type, which a
  // Buffer-derived Uint8Array (ArrayBufferLike-backed) doesn't satisfy.
  const credential: WebAuthnCredential = { id: stored.id, publicKey: stored.publicKey.slice(), counter: stored.counter, transports: stored.transports };
  const result = await verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, credential });
  if (!result.verified) return null;
  return { newCounter: result.authenticationInfo.newCounter };
}
