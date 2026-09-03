# `@app/server`

Fastify + TypeScript + PostgreSQL backend. Current scope: grading (existing) and a first
authentication/users foundation — Google sign-in only, backend-managed sessions, no
passwords, no other features yet (see root README for the wider project).

## Stack

- **Fastify** (HTTP), **PostgreSQL** via `pg` (no ORM), hand-written SQL migrations.
- **Google OAuth 2.0 / OIDC**, authorization-code flow with PKCE, via `google-auth-library`
  (official Google client — verifies the ID token's signature/issuer/audience for you).
- Opaque, server-side sessions stored in Postgres, delivered via an `HttpOnly` cookie. No
  JWTs or long-lived tokens are ever sent to the browser.

## Running locally

### Option A — Docker Compose (backend + Postgres)

From the **repo root**:

```bash
cp .env.example .env        # then fill in GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET
docker compose up --build
```

This starts `postgres` (with a persistent named volume) and `backend` (Fastify, listening on
`:8787`, published to the host). The backend's `depends_on` waits for Postgres's healthcheck
before starting, and the app itself also retries the connection on boot — see "Startup and
failure behavior" below.

Other useful commands:

```bash
docker compose up -d --build      # detached
docker compose down               # stop + remove containers (keeps the postgres_data volume)
docker compose down -v            # also DELETE the postgres_data volume (wipes the database)
docker compose logs -f backend
docker compose logs -f postgres
docker compose ps                 # includes health status
docker compose restart backend
```

Run migrations against the Compose Postgres (after `docker compose up -d postgres` and the
backend image has been built at least once):

```bash
docker compose exec backend npm run migrate
```

(If `backend` isn't running yet, `docker compose run --rm backend npm run migrate` works too.)

**Verify Postgres health:**

```bash
docker compose ps                          # STATUS column shows "healthy"
docker compose exec postgres pg_isready -U chunki -d chunki
```

**Inspect a failed migration:** the runner wraps each `.sql` file in a transaction and rolls
it back on error, so a bad migration never leaves the schema half-applied. Check what actually
failed with:

```bash
docker compose logs backend | grep -A5 "Applying\|failed"
docker compose exec postgres psql -U chunki -d chunki -c 'select * from schema_migrations;'
```

**Reset the local database** (drops all data, re-runs migrations from scratch):

```bash
docker compose down -v          # removes the postgres_data volume
docker compose up -d postgres
docker compose exec backend npm run migrate
```

### Option B — backend on the host, Postgres in Docker

```bash
docker compose up -d postgres          # Postgres only, port published to localhost:5432
cp apps/server/.env.example apps/server/.env   # fill in Google creds etc.; DATABASE_URL already points at localhost
npm install
npm run build:shared
npm run migrate:dev -w apps/server     # applies migrations via tsx, no build step needed
npm run dev:server                     # http://localhost:8787
```

## Google OAuth setup

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
   **OAuth client ID** of type **Web application**.
2. Add an **Authorized redirect URI** that exactly matches `GOOGLE_REDIRECT_URI`:
   - local dev: `http://localhost:8787/api/auth/google/callback`
   - any other environment: `https://<your-backend-host>/api/auth/google/callback`
3. Configure the **OAuth consent screen** (scopes needed: `openid`, `email`, `profile` — the
   defaults; no sensitive/restricted scopes are requested).
4. Put the resulting **Client ID** and **Client secret** into `.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`. Never commit these — `.env` is gitignored, and `docker-compose.yml`
   refuses to start without them (`${GOOGLE_CLIENT_ID:?...}` — no insecure fallback).

`SESSION_SECRET` is unrelated to Google — it signs a short-lived (10 minute) cookie that holds
the OAuth `state`/`nonce`/PKCE verifier between `/api/auth/google` and the callback. Generate
one with `openssl rand -base64 32`.

## Startup and failure behavior

- **Missing/invalid env config** (Google credentials, `SESSION_SECRET`, `DATABASE_URL`,
  `FRONTEND_URL`) → the process fails immediately at boot with a listing of exactly what's
  wrong. There is no insecure fallback for any of these.
- **Postgres unreachable** → `waitForDatabase()` retries (10 attempts, 1s apart) before giving
  up with a clear fatal error. In Docker Compose this is defense-in-depth on top of
  `depends_on: condition: service_healthy`, which already delays the backend's start.

## API

```text
GET  /api/auth/google            — starts Google sign-in (redirects to Google)
GET  /api/auth/google/callback   — Google redirects here; sets the session cookie, then
                                    redirects to FRONTEND_URL (or FRONTEND_URL/?auth_error=1)
GET  /api/auth/me                — { user: { id, email, displayName, imageUrl } } or 401
POST /api/auth/logout            — invalidates the session, clears the cookie
```

`FRONTEND_URL` is the *only* redirect destination the callback ever uses — there's no
client-suppliable "return to" parameter, so there's nothing to make an open redirect out of.

### Google profile images — read, never stored

Google's ID token includes a `picture` claim (the user's profile photo URL). Chunki:

- reads it once, at login, from the verified ID token (signature/issuer/audience already
  checked by `google-auth-library`) — never from anything the client sends;
- keeps it **only** on the current session row (`sessions.provider_image_url`), so it can be
  returned from `/api/auth/me` while that session is alive;
- **never** writes it to the `users` table — there is no `image_url`/`avatar_url` column
  there, and the backend has no image upload, download, proxy, or storage endpoint at all.

If a session doesn't have a stored image URL (or Google didn't provide one), `imageUrl` is
simply `null`. The backend never makes an extra call to Google just to fetch a picture.

### Verifying authentication manually

With `docker compose up` (or `npm run dev:server`) running and real Google credentials in
`.env`:

1. Open `http://localhost:8787/api/auth/google` in a browser (not curl — it's a real
   redirect-based login). You'll land on Google's consent screen, then get redirected back to
   `FRONTEND_URL` (there's no frontend yet, so this will look like a dead page — that's
   expected; check the cookie instead).
2. Check the `chunki_session` cookie was set (HttpOnly, so `document.cookie` won't show it —
   use your browser's DevTools → Application/Storage → Cookies).
3. `curl -b "chunki_session=<value from devtools>" http://localhost:8787/api/auth/me` should
   return your Google account's email/name/picture.
4. `curl -i -b "chunki_session=<value>" -X POST http://localhost:8787/api/auth/logout`, then
   repeat step 3 — it should now 401.

Without real Google credentials, you can still exercise everything except the actual Google
handshake — see "Tests" below, and note that `GET /api/auth/google` itself works with any
placeholder `GOOGLE_CLIENT_ID`/`SECRET` (it only builds a redirect URL; nothing is validated
until the callback exchanges a real code with Google).

## Database

Schema: `users`, `auth_identities` (one row per external account linked to a user — unique on
`(provider, provider_user_id)`), `sessions` (opaque server-side sessions; the cookie carries a
random token, Postgres stores only its SHA-256 hash). See `migrations/0001_users_auth.sql` for
the exact DDL. Migrations are plain `.sql` files applied in filename order by
`src/db/migrate.ts`, tracked in a `schema_migrations` table — nothing touches the schema
outside that runner.

## Tests

```bash
npm test -w apps/server                 # fast, hermetic — no database or network required
npm run test:integration -w apps/server # needs a real, migrated Postgres (see below)
```

The default `npm test` mocks the database and Google verification boundaries entirely (no
Docker needed), so it stays fast. `test:integration` exercises the real SQL — the unique
identity constraint, the login race-condition handling, and a schema check confirming no
image/avatar column ever gets added — against Postgres:

```bash
docker compose up -d postgres
docker compose exec backend npm run migrate     # or: npm run migrate:dev -w apps/server, from the host
npm run test:integration -w apps/server         # reads DATABASE_URL from apps/server/.env
```

Automated tests never make a real network call to Google — the provider-verification boundary
(`modules/auth/google.ts`) is mocked/bypassed, and business logic is tested from an
already-verified profile object, matching how the route handlers use it after
`exchangeGoogleCode` returns.
