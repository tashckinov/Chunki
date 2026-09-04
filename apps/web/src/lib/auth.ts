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
  setStoredToken(null);
}

/** True if the backend sent us back with ?auth_error=1 after a failed Google login. */
export function consumeAuthErrorFlag(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('auth_error')) return false;
  url.searchParams.delete('auth_error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  return true;
}
