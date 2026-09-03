# `@app/server`

Fastify + TypeScript + PostgreSQL backend. Current scope: grading (existing), authentication/users
(Google sign-in only, backend-managed sessions, no passwords), and a read-only learning content
model — collections of chunks/collocations (e.g. "Travel Basics" → "check in", "miss a flight").
No AI generation yet anywhere in the backend (see root README for the wider project).

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

Run migrations, then seed demo content, against the Compose Postgres (after
`docker compose up -d postgres` and the backend image has been built at least once):

```bash
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

(If `backend` isn't running yet, `docker compose run --rm backend npm run migrate` — and `... seed`
— work too.)

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
npm run seed:dev -w apps/server        # loads demo collections/chunks (safe to re-run)
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

## Deploying (VPS backend + GitHub Pages frontend)

The frontend (`apps/web`) is static and stays on GitHub Pages. The backend can't live there —
it needs its own always-on host with Docker. Once frontend and backend are on different
domains, that's a genuinely **cross-site** setup (not just cross-*origin* like local dev's
different ports), which changes a few things vs. local dev:

1. **Put a reverse proxy with real TLS in front of the backend.** Fastify itself only speaks
   plain HTTP; something like Caddy (auto-HTTPS, one-line config) or nginx + certbot needs to
   terminate HTTPS and forward to `127.0.0.1:8787` (or the `backend` container). This is
   required, not optional — see point 3.
2. **Point a domain at the VPS** (e.g. `api.yourdomain.com`) and use that (over HTTPS) as
   `GOOGLE_REDIRECT_URI`. Add the same URL as an Authorized redirect URI on the Google OAuth
   client (Google Cloud Console → Credentials) — it has to match exactly.
3. **Set `NODE_ENV=production`.** This switches session/OAuth cookies to
   `SameSite=None; Secure`, which cross-site credentialed requests require — browsers silently
   drop `SameSite=Lax` cookies set/read across different sites, and `Secure` cookies require
   HTTPS (hence point 1).
4. **Set `FRONTEND_URL` to the full GitHub Pages URL, including the `/Chunki` path** (e.g.
   `https://<user>.github.io/Chunki`) — that's where the callback redirects after login.
5. **Set `CORS_ORIGIN` to the bare origin, without a path** (e.g. `https://<user>.github.io` —
   no `/Chunki`). This is deliberately a separate variable from `FRONTEND_URL`: a browser's
   `Origin` header never includes a path, so a path-bearing `CORS_ORIGIN` would just never
   match and every credentialed request would be silently rejected by CORS.

Then, on the VPS:

```bash
git clone <repo> && cd Chunki
cp .env.example .env    # fill in GOOGLE_*, SESSION_SECRET, and the prod values above
docker compose up -d --build
docker compose exec backend npm run migrate
```

Everything else (commands, healthchecks, migrations) is identical to local Docker Compose use —
see "Running locally" above.

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

## Collections & chunks

Read-only learning content: `collections` (e.g. "Travel Basics") group `chunks` — reusable
English expressions/collocations like "check in" or "sounds good", not limited to traditional
strict collocations. A chunk can belong to more than one collection (`collection_chunks` is a
join table, not a column on `chunks`), and each collection controls its own chunk ordering via
`collection_chunks.position`. No AI generation is involved anywhere here — this is a plain,
hand-authored content model; AI-assisted authoring can be layered on top of it later.

```text
GET /api/collections            — published collections, ordered by position
GET /api/collections/:slug      — one collection + its chunks, ordered by position
GET /api/chunks/:id             — one chunk
```

All three require an authenticated session (same cookie as `/api/auth/me`) and return
`{ error: 'unauthorized' }` with `401` otherwise. An unknown/unpublished slug or unknown chunk id
returns `{ error: 'not_found' }` with `404` — malformed input (a non-UUID chunk id, a slug with
invalid characters) is treated the same way rather than as a separate `400`, so nothing about the
database (e.g. that ids are UUIDs) leaks through an error response.

Unpublished collections (`is_published = false`) never appear in `GET /api/collections` and
`GET /api/collections/:slug` behaves as if they don't exist — there's no separate "admin" view of
them yet.

### Seeding demo content

```bash
npm run seed:dev -w apps/server   # local, via tsx
npm run seed -w apps/server       # after a build, e.g. inside the backend container
```

Loads ~3 demo collections (Everyday English, Travel Basics, Work & Communication) with 8-9
chunks each — realistic content, but development/demo data, not the final learning dataset. Safe
to run more than once: collections upsert by `slug`, chunks upsert by `text`, and collection
memberships upsert by `(collection_id, chunk_id)`, so re-running just refreshes the same rows
instead of duplicating them.

## Database

Schema: `users`, `auth_identities` (one row per external account linked to a user — unique on
`(provider, provider_user_id)`), `sessions` (opaque server-side sessions; the cookie carries a
random token, Postgres stores only its SHA-256 hash), `collections`, `chunks`, `collection_chunks`
(join table; deleting a collection or a chunk cascades only to that membership row, never to the
other side — see the comments in `migrations/0002_collections_chunks.sql`). Migrations are plain
`.sql` files applied in filename order by `src/db/migrate.ts`, tracked in a `schema_migrations`
table — nothing touches the schema outside that runner.

## Tests

```bash
npm test -w apps/server                 # fast, hermetic — no database or network required
npm run test:integration -w apps/server # needs a real, migrated Postgres (see below)
```

The default `npm test` mocks the database and Google verification boundaries entirely (no
Docker needed), so it stays fast. `test:integration` exercises the real SQL against Postgres —
the unique identity constraint, the login race-condition handling, a schema check confirming no
image/avatar column ever gets added, unpublished collections being invisible, chunks coming back
in collection-specific position order, and the `(collection_id, chunk_id)` uniqueness constraint
rejecting a duplicate membership:

```bash
docker compose up -d postgres
docker compose exec backend npm run migrate     # or: npm run migrate:dev -w apps/server, from the host
npm run test:integration -w apps/server         # reads DATABASE_URL from apps/server/.env
```

The integration suite inserts its own uniquely-suffixed rows and doesn't delete them afterward
(matching the existing auth integration tests) — run it against a disposable dev database, not
one you care about staying clean.

Automated tests never make a real network call to Google — the provider-verification boundary
(`modules/auth/google.ts`) is mocked/bypassed, and business logic is tested from an
already-verified profile object, matching how the route handlers use it after
`exchangeGoogleCode` returns.
