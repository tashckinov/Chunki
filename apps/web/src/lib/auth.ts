import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

// GitHub Pages is static — there's no dev-server proxy to route /api/* to the
// backend, so production needs an absolute URL (set at build time). Local
// dev leaves this empty and relies on Vite's proxy (see vite.config.ts).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

// Safari (macOS and iOS, including installed PWAs) blocks the cross-site
// session cookie outright, so the callback also hands the session token back
// via URL fragment. We keep it here and resend it as a normal Authorization
// header, which every browser sends on a plain cross-origin fetch.
const TOKEN_STORAGE_KEY = 'chunki_auth_token';

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private browsing / storage disabled — nothing we can do, auth just
    // won't persist across reloads.
  }
}

/** Auth header for any authenticated API call — see collections.ts. */
export function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Lets a WebAuthn ceremony (which gets its token from a JSON response body, not a URL fragment) store it the same way Google's flow does. */
export function applyAuthToken(token: string): void {
  setStoredToken(token);
}

// Whether this browser has ever successfully registered a Chunki passkey —
// lets signInWithPasskey() decide "register" vs "authenticate" up front
// instead of guessing from an ambiguous WebAuthn error. Deliberately NOT
// cleared by logout(): the next sign-in on this device should still try to
// authenticate with the existing passkey, not silently register a new one.
const PASSKEY_REGISTERED_KEY = 'chunki_passkey_registered';

function hasRegisteredPasskey(): boolean {
  try {
    return localStorage.getItem(PASSKEY_REGISTERED_KEY) === 'true';
  } catch {
    return false;
  }
}

function markPasskeyRegistered(): void {
  try {
    localStorage.setItem(PASSKEY_REGISTERED_KEY, 'true');
  } catch {
    // Private browsing / storage disabled — the next click will just try to
    // register again, which is harmless (if slightly redundant).
  }
}

/** Picks up the token the backend left in the URL fragment after Google login. */
export function consumeAuthToken(): void {
  const match = /(?:^#|&)auth_token=([^&]+)/.exec(window.location.hash);
  if (!match) return;
  setStoredToken(decodeURIComponent(match[1]));
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState({}, '', url.pathname + url.search);
}

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  /** From Google's verified profile at login time — never client-supplied. */
  imageUrl: string | null;
  isAdmin: boolean;
}

/** Full-page redirect into the backend's OAuth flow — not a fetch. */
export function startGoogleLogin(): void {
  window.location.href = apiUrl('/api/auth/google');
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(apiUrl('/api/auth/me'), { credentials: 'include', headers: authHeaders() });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/auth/me failed: ${res.status}`);
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include', headers: authHeaders() });
  // Only the session token clears here — chunki_passkey_registered survives
  // logout on purpose, see its definition above.
  setStoredToken(null);
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Registers a brand-new passkey/account on this device and logs the user in. */
export async function registerPasskey(): Promise<AuthUser> {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const { options } = await postJson<{ options: PublicKeyCredentialCreationOptionsJSON }>('/api/auth/webauthn/register/options');
  const attestation = await startRegistration({ optionsJSON: options });
  const { token, user } = await postJson<{ token: string; user: AuthUser }>('/api/auth/webauthn/register/verify', attestation);
  applyAuthToken(token);
  markPasskeyRegistered();
  return user;
}

/** Authenticates with an existing passkey on this device — usernameless, the OS picks the credential. */
export async function authenticatePasskey(): Promise<AuthUser> {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const { options } = await postJson<{ options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/webauthn/login/options');
  const assertion = await startAuthentication({ optionsJSON: options });
  const { token, user } = await postJson<{ token: string; user: AuthUser }>('/api/auth/webauthn/login/verify', assertion);
  applyAuthToken(token);
  return user;
}

/**
 * The single "Войти через Passkey" entry point. WebAuthn can't distinguish
 * "user cancelled the prompt" from "no passkey exists on this device" (both
 * surface as the same error, by spec, for privacy reasons) — so on any
 * authentication failure this deliberately falls through to registering a
 * fresh passkey/account rather than showing a confirmation step, per product
 * decision. That can silently create a duplicate account on an accidental
 * cancel; reconciling duplicates is planned as a separate future "sync code"
 * feature, not handled here.
 */
export async function signInWithPasskey(): Promise<AuthUser> {
  if (!hasRegisteredPasskey()) return registerPasskey();
  try {
    return await authenticatePasskey();
  } catch {
    return registerPasskey();
  }
}

/** True if the backend sent us back with ?auth_error=1 after a failed Google login. */
export function consumeAuthErrorFlag(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('auth_error')) return false;
  url.searchParams.delete('auth_error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  return true;
}
