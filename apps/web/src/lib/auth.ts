// GitHub Pages is static — there's no dev-server proxy to route /api/* to the
// backend, so production needs an absolute URL (set at build time). Local
// dev leaves this empty and relies on Vite's proxy (see vite.config.ts).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
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
  const res = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/auth/me failed: ${res.status}`);
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
}

/** True if the backend sent us back with ?auth_error=1 after a failed Google login. */
export function consumeAuthErrorFlag(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('auth_error')) return false;
  url.searchParams.delete('auth_error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  return true;
}
