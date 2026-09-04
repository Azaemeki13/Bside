# B-Side Backend — Architecture Guide

Welcome. This document is the map for the Rust backend: what runs, how the
pieces talk to each other, and where to find the code for a given feature.
It assumes no prior context beyond general Rust/web/SQL knowledge.

## 1. The system, in one picture

```
                         ┌─────────────┐
                         │   Angular   │  (front/)
                         │  frontend   │
                         └──────┬──────┘
                                │ HTTPS, /api/** (nginx strips /api)
                                ▼
                         ┌─────────────┐        ┌──────────────────┐
                         │    nginx     │──────▶│  bside_rust_backend│  (back/) ← this crate
                         │  (TLS term.) │        │   axum, port 8080 │
                         └─────────────┘        └───┬───────┬──────┘
                                                     │       │
                              JWT/session, SQL, S3   │       │ fire-and-forget
                                                     ▼       │ POST /analyze
                                              ┌────────────┐ │
                                              │ PostgreSQL │ │
                                              └────────────┘ │
                                                     ▲        ▼
                                                     │  ┌───────────────┐
                                              callback│  │ bside_ml_service│ (ml_engine/)
                                              (X-API-Key) │  FastAPI, port 8000
                                                     │  └───────┬───────┘
                                                     │          │ downloads track
                                                     │          ▼
                                              ┌──────┴────┐  ┌───────┐
                                              │ Rust backend│  │ MinIO │ (S3-compatible object storage)
                                              └────────────┘  └───────┘
```

There's also a **`daily_mix_worker`** binary — the same crate, built from the
same `back/` source, run as a separate container on a nightly cron-like loop
(see `back/src/bin/daily_mix_worker.rs`). It recomputes each user's taste
vector and generates their "Daily Mix" playlist. It shares code with the main
API (`daily_mix.rs`, `preferences.rs`) but is a distinct process — it never
answers HTTP requests.

All five services (`db`, `minio`, `ml_service`, `backend`, `daily-mix-worker`,
`frontend`, `nginx`) are wired together in `docker-compose.yml` at the repo
root. Container names (`bside_rust_backend`, `bside_ml_service`, etc.) are
also the DNS names services use to reach each other *inside* the Docker
network — you'll see them hardcoded in a couple of places (e.g.
`http://bside_ml_service:8000/analyze` in `handlers/songs.rs`).

## 2. Crate layout

`back/` is a single Cargo package that produces **two binaries** sharing one
`src/` tree:

| Binary | Entry point | Role |
|---|---|---|
| `bside` (the API server) | `src/main.rs` | Builds the `axum::Router`, wires every route to a handler, starts listening on `$PORT` (default 8080). |
| `daily_mix_worker` | `src/bin/daily_mix_worker.rs` | Standalone loop: refresh preference vectors, generate missing daily mixes, sleep until 4am UTC, repeat. |

There's also a `src/lib.rs` that re-exports a handful of modules
(`auth`, `daily_mix`, `error`, `models`, `network`, `preferences`) so that
`daily_mix_worker.rs` — which is *not* part of the `bside` binary's own module
tree — can pull in the pieces it needs via `bside::daily_mix::...` etc.

### Top-level modules (`back/src/*.rs`)

| Module | What it owns |
|---|---|
| `main.rs` | App bootstrap: env vars, DB pool + migrations, S3 buckets, OAuth client, CORS, rate limiting, and the full route table (which path maps to which handler). |
| `models.rs` | Every request/response DTO and the `AppState` struct (the one piece of shared state — DB pool, HTTP client, JWT secret, S3 clients, presence tracker — that's cloned into every handler via axum's `State` extractor). |
| `error.rs` | `BSideError`, the one error enum every handler returns. Each variant maps to an HTTP status in its `IntoResponse` impl, so a handler just does `?` on a `sqlx::Error` or a validation failure and axum turns it into the right response. |
| `auth.rs` | JWT issuing/verification (`Claims`, `create_jwt`), the `auth_gate` middleware (rejects banned users), the `PublicApiKey` extractor (for service-to-service calls like the ML callback), and `AnyAuth` (accepts a user JWT, the public API key, or neither — used on endpoints that behave differently for logged-in vs. anonymous callers). |
| `handlers/` | **All HTTP request handlers**, one file per feature. See §3 below — this is the module you'll touch most often. |
| `network.rs` | In-memory "who's online" tracker, keyed by user ID, backing the WebSocket presence feature. |
| `ws.rs` | The `/ws` WebSocket endpoint: real-time chat delivery and presence broadcast to friends. |
| `search.rs` | The `/search` full-text/catalog search endpoint (songs, albums, artists, playlists). |
| `recommendations.rs` | `/fresh-picks` — cosine-similarity recommendations against a user's taste vector. |
| `preferences.rs` | Maintains each user's rolling "taste vector" from their play/like/skip history (weighted average of song feature vectors). Called after every like/unlike/interaction. |
| `daily_mix.rs` | The nightly "Daily Mix" generation algorithm (candidate scoring, diversity constraints) plus the `GET /users/me/daily-mix` handler that serves the precomputed result. |
| `public_api.rs` | A separate, API-key-authenticated CRUD surface for artists (`/public-api/artists`), meant for external integrations rather than the web app. |
| `swagger.rs` | The `utoipa` `#[derive(OpenApi)]` registry — lists every documented handler and DTO so `/swagger-ui` can render interactive API docs. |

## 3. `handlers/` — one file per feature

This used to be a single 4,177-line `handlers.rs`. It's now split so each
file covers one slice of the product:

| File | Feature |
|---|---|
| `accounts.rs` | Register, classic login, Google OAuth (login/signup/callback), avatar upload, profile self-edit, `GET /users/me`. |
| `misc.rs` | Health check (`/ping`) and the public contact form. |
| `users.rs` | Public user directory reads (`/users`, `/users/{id}`) — no email/role/ban data exposed. |
| `artists.rs` | Artist profile creation (admin-only today) and public artist reads. |
| `artist_requests.rs` | The "become an artist" workflow: a user requests it, an admin approves/denies it. |
| `albums.rs` | An artist's own album management + public album reads. |
| `songs.rs` | Song upload (presigned S3 URL), verification (kicks off ML analysis), the ML result callback, streaming, deletion, "new release" pick. |
| `playlists.rs` | Playlist CRUD and song membership. |
| `likes.rs` | The implicit per-user "Liked Songs" playlist (like/unlike). |
| `interactions.rs` | Raw play/complete/skip/replay event logging, which feeds `preferences.rs`. |
| `social.rs` | Friend requests, accept/reject/remove, friend list with live presence. |
| `messages.rs` | Direct messages and the conversation list. |
| `analytics.rs` | Per-user listening stats, recent plays, top artists. |
| `admin.rs` | User moderation (ban/unban/edit/delete) and creating an album on behalf of an artist. |
| `util.rs` | Shared, non-public-facing helpers: input validation (`required_text`, `valid_email`, `validate_genre`, ...), `public_storage_url`, and role checks (`is_admin`, `ensure_admin_or_moderator`, ...). |
| `mod.rs` | Declares the submodules and re-exports every handler at `handlers::*`, so `main.rs`'s route table and `swagger.rs`'s OpenAPI registry don't need to know which file a handler lives in. |

**Convention if you're adding a new endpoint:** find the file matching your
feature (or add a new one if it's a genuinely new feature area), add the
handler there, add `mod your_file; pub use your_file::*;` to `handlers/mod.rs`
if it's new, then wire the route in `main.rs`. Put any validation/permission
logic you need in more than one file into `handlers/util.rs`.

## 4. Request lifecycle (a concrete example: liking a song)

1. Frontend calls `POST /api/songs/{id}/like` → nginx strips `/api`, forwards
   to `bside_rust_backend:8080/songs/{id}/like`.
2. `main.rs`'s `protected_routes` router requires a valid JWT (`auth_gate`
   middleware + the `Claims` extractor pulls `user_id` out of the token).
3. `handlers::likes::like_song_handler` runs: finds-or-creates the user's
   "Liked Songs" playlist, checks the song is `Ready`, inserts into
   `playlist_songs` and `user_song_interactions`, all inside one DB
   transaction.
4. On success, it calls `preferences::refresh_user_preference` so the user's
   taste vector immediately reflects the new like (best-effort — a failure
   here is logged, not returned to the client).
5. Response goes back through nginx to the frontend.

## 5. The ML round trip

This is the one place the backend talks to a service that isn't the database:

1. An artist uploads a track. The backend hands out a **presigned S3 PUT
   URL** (`handlers::songs::create_song_handler`) so the browser uploads
   the audio file straight to MinIO — the file never passes through the
   Rust process.
2. The frontend then calls `PUT /songs/{id}/verify`
   (`handlers::songs::verify_song_handler`), which checks the object exists,
   isn't oversized, and has a real WAV/FLAC header — then **fires off a
   background POST** to `http://bside_ml_service:8000/analyze` and marks the
   song `Pending`.
3. `ml_engine/src/analyzer.py` (FastAPI) downloads the object from MinIO,
   runs audio analysis (tempo/key via `librosa`, danceability/mood/valence
   via pretrained Essentia MusiCNN models — see `ml_engine/src/analyzer.py`
   for the model list), and computes a 6-value `normalized_vector` used for
   recommendations.
4. It POSTs the result back to
   `http://bside_rust_backend:8080/internal/songs/features`
   (`handlers::songs::ml_callback_handler`), authenticated with a shared
   secret (`X-API-Key` header, checked by the `PublicApiKey` extractor in
   `auth.rs` — **not** a user JWT, since the ML service has no user session).
   The handler marks the song `Ready` (and its album `Ready` too, if this was
   its first playable track).
5. `recommendations.rs` and `daily_mix.rs` later use that `normalized_vector`
   (cosine similarity against a user's preference vector) to rank songs.

`ml_engine/src/batch_analyze.py` is an offline tool that pre-computes and
caches analysis results (`ML_RESULT_CACHE_DIR`) so a demo/seed dataset can
replay the whole pipeline without re-running the ML models every time.

## 6. The frontend connection

- The Angular app (`front/`) never talks to the backend directly in dev — it
  proxies `/api/**` to `http://localhost:8080` (see
  `front/src/proxy.conf.json`), stripping the `/api` prefix. In production,
  `nginx` (`infra/nginx/`) does the same job as a TLS-terminating gateway.
- `front/src/environment.ts` sets `apiUrl: '/api'`; every Angular service
  under `front/src/app/services/*.service.ts` (e.g. `album.service.ts`,
  `playlist.service.ts`, `auth.service.ts`) builds requests as
  `` `${environment.apiUrl}/...` ``.
- Auth: the frontend stores the JWT returned by `/login` or the Google OAuth
  redirect (`/login#token=...`) and attaches it as `Authorization: Bearer
  <token>` via an HTTP interceptor (`auth.interceptor.ts`). The Rust side
  validates it via the `Claims` extractor on every protected route.
- Real-time features (chat, presence) go over `/ws` instead of REST — see
  `ws.rs` on the backend.
- The full, generated API contract (every route, request/response shape) is
  browsable at `/swagger-ui` once the backend is running — that's the
  authoritative source of truth for the HTTP contract, generated from the
  `#[utoipa::path(...)]` annotations on the handlers themselves.

## 7. Data layer

- **PostgreSQL**, accessed exclusively through `sqlx` — no ORM. Every query
  is a compile-time-checked `sqlx::query!`/`query_as!`/`query_scalar!` macro
  call, which means:
  - The DB schema and the Rust code can never drift silently — a query that
    doesn't match the schema fails to *compile*.
  - This requires either a live DB connection at compile time, or a cached
    "offline" snapshot of every query's shape in `back/.sqlx/*.json`
    (checked into git). Docker builds always use `SQLX_OFFLINE=true` and the
    checked-in cache — see `back/Dockerfile`.
  - **If you add or change a query**, you must regenerate that cache with a
    live DB connection (`cargo sqlx prepare`) before it will build offline —
    see the workflow note at the bottom of this file.
- Schema migrations live in `back/migrations/`, applied automatically on
  backend startup (`sqlx::migrate!` in `main.rs`).
- **MinIO** (S3-compatible) stores binary blobs: track audio, cover art,
  avatars. The backend only ever hands out presigned URLs for upload/
  download — audio bytes don't flow through the Rust process except for a
  32-byte header sniff during `verify_song_handler`.

## 8. Quick reference: local dev workflow

```bash
# Offline build (matches what Docker/CI does):
cd back && SQLX_OFFLINE=true cargo build --bins

# Run tests:
SQLX_OFFLINE=true cargo test

# Changed a sqlx::query!? Regenerate the offline cache against a live DB:
export DATABASE_URL="postgresql://bside_admin:<DB_PASSWORD>@localhost:5432/bside_db"
cargo sqlx prepare -- --bin bside
# then confirm the offline build still passes:
unset DATABASE_URL && SQLX_OFFLINE=true cargo build --bins
```

The full docker stack is started from the repo root with
`docker compose up -d --build`.
