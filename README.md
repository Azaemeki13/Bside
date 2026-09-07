# B-Side

A self-hosted music streaming platform: upload tracks, stream them, build
playlists, follow friends and chat in real time, and get taste-based
recommendations (per-track "Fresh Picks" and a nightly "Daily Mix") powered by
an audio-analysis ML service.

The stack is a Rust/Axum API, an Angular frontend, PostgreSQL, S3-compatible
object storage (MinIO), and a Python/FastAPI ML engine, all wired together with
Docker Compose behind an nginx TLS gateway.

---

## Architecture

```
          ┌────────────┐   HTTPS    ┌────────────────┐
 browser ─▶│   nginx    │──/api/**──▶│  Rust backend  │  axum, :8080
          │ TLS gateway │──/ws──────▶│  (bside)       │
          │  :80 :443   │──/  ──────▶└──┬──────┬──────┘
          └─────┬───────┘  Angular      │      │ fire-and-forget POST /analyze
                │  frontend             │      ▼
                │                       │   ┌──────────────┐
   /bside-*  ───┘                       │   │  ML service  │  FastAPI, :8000
   (presigned objects)                  │   │ (ml_engine)  │
                                        ▼   └──┬────────┬──┘
                                  ┌──────────┐ │        │ downloads track
                                  │ Postgres │◀┘        ▼
                                  └──────────┘      ┌───────┐
                                        ▲           │ MinIO │  S3-compatible
                            callback (X-API-Key)    └───────┘
```

A separate **`daily_mix_worker`** process (same `back/` crate, its own
container) runs a nightly loop: recompute every user's taste vector from their
play/like/skip history, then generate each user's Daily Mix playlist.

For a full walkthrough of the backend — modules, request lifecycle, the ML round
trip, the data layer — see [`back/ARCHITECTURE.md`](back/ARCHITECTURE.md).

### Services

| Service              | Container               | Role                                        |
| -------------------- | ----------------------- | ------------------------------------------- |
| `nginx`              | `bside_https_gateway`   | TLS termination, routing (`:80`, `:443`)    |
| `frontend`           | `bside_frontend`        | Angular app (SSR), served via nginx         |
| `backend`            | `bside_rust_backend`    | Rust/Axum HTTP + WebSocket API (`:8080`)    |
| `daily-mix-worker`   | `bside_daily_mix_worker`| Nightly preference refresh + Daily Mix gen  |
| `ml_service`         | `bside_ml_service`      | Audio analysis, produces track feature vectors |
| `db`                 | `bside_db_dev`          | PostgreSQL 15 (loopback `:5432`)            |
| `minio` / `minio-setup` | `bside_minio`        | Object storage for audio, covers, avatars   |
| `adminer`            | `bside_adminer`         | DB web UI (loopback `:8081`)                |

Only nginx (`80`/`443`), Postgres (`127.0.0.1:5432`) and Adminer
(`127.0.0.1:8081`) are reachable from the host; everything else is private to
the Compose network.

---

## Quick start

### Prerequisites

- Docker + Docker Compose
- GNU Make
- [`sqlx-cli`](https://crates.io/crates/sqlx-cli) — `cargo install sqlx-cli --no-default-features --features native-tls,postgres` (used by `make migrate`; the backend container also applies migrations on startup)

### Run it

```bash
cp .env.example .env
# edit .env: set JWT_SECRET, PUBLIC_API_KEY (32+ chars), DB_PASSWORD,
# ADMIN_* and, if you want Google login, OAUTH_ID / OAUTH_PW.

make up            # build + start the stack, wait for the DB, run migrations
```

Then open **https://localhost** (self-signed cert — accept the warning once).

| URL                              | What                                  |
| -------------------------------- | ------------------------------------- |
| `https://localhost`              | The application                       |
| `https://localhost/swagger-ui`   | Interactive API docs (generated)      |
| `http://localhost:8081`          | Adminer (DB browser)                  |

`make down` stops it; `make re` rebuilds from scratch; `make logs` tails
everything. See `make` targets below.

---

## Test data

`make up` gives you an empty catalogue plus the admin account from your `.env`.
Load one of the seed sets for something to click on:

```bash
# Social / chat demo (friends, requests, conversations, presence)
docker exec -i bside_db_dev psql -U bside_admin -d bside_db < back/seeds/chat_seed.sql
```

Accounts created by `chat_seed.sql` (password `Password123!` for all):

| Email                       | Notes                                                     |
| --------------------------- | -------------------------------------------------------- |
| `luna.rivera@bside.local`   | Main account — friends, incoming/outgoing requests, conversations, unread messages, online/offline presence |
| `alex.martin@bside.local`   |                                                          |
| `maya.chen@bside.local`     |                                                          |
| `noah.bernard@bside.local`  |                                                          |
| `ethan.cole@bside.local`    |                                                          |

Other seeds: `full_seed.sql` (base users incl. admin, used by the ML showcase),
`seed_preference_test.sql`, `seed_song_share_test.sql`.

Handy DB peek:

```bash
make db-shell        # psql shell into the running DB
docker exec -it bside_db_dev psql -U bside_admin -d bside_db \
  -c "SELECT id, username, email FROM users;"
```

---

## ML recommendation showcase

There's a reproducible demo of the recommendation system: a 249-track
catalogue uploaded through the real upload → analyze → callback pipeline, 15
listener personas with distinct tastes, and a proof that preference vectors
drift every night as personas listen.

```bash
make showcase        # stack up → seed → catalogue → personas → verify Daily Mixes
make showcase-drift  # replay the "vectors drift every night" proof
```

The catalogue audio is git-ignored (5.8 GB); a frozen analysis cache in
`ml_cache/` lets the pipeline replay without a GPU. Full narrative in
[`B-SIDE_ML_SHOWCASE.md`](B-SIDE_ML_SHOWCASE.md), operational steps in
[`ML_SHOWCASE_RUNBOOK.md`](ML_SHOWCASE_RUNBOOK.md). The preference-weighting
formula is in [`PREFERENCE_SYSTEM_README.md`](PREFERENCE_SYSTEM_README.md).

---

## Repository layout

```
back/           Rust/Axum API + daily_mix_worker binary (see back/ARCHITECTURE.md)
  src/handlers/   one file per feature area (accounts, songs, playlists, social, …)
  migrations/     sqlx migrations, applied on startup
  seeds/          SQL seed sets
front/          Angular 21 app (SSR), Tailwind
ml_engine/      FastAPI audio-analysis service (librosa + Essentia MusiCNN)
infra/nginx/    TLS gateway image + routing config
infra/db_init/  Postgres bootstrap SQL
scripts/        showcase tooling (upload, verify, night simulation) + MinIO setup
ml_cache/       frozen ML analysis results for offline showcase replay
docker-compose.yml        the stack
docker-compose.gpu.yml    overlay: give ml_service the host GPU (make up-gpu)
```

---

## Local development

**Backend** — offline build (what Docker/CI does), from `back/`:

```bash
cd back
SQLX_OFFLINE=true cargo build --bins
SQLX_OFFLINE=true cargo test
```

If you add or change a `sqlx::query!`, regenerate the offline cache against a
live DB and commit `back/.sqlx/`:

```bash
export DATABASE_URL="postgres://bside_admin:<DB_PASSWORD>@localhost:5432/bside_db"
cargo sqlx prepare -- --bin bside
```

**Frontend** — from `front/` (`npm install` first):

```bash
npm start        # ng serve on http://localhost:4200, proxies /api → :8080
npm test         # Vitest
npm run build
```

`front/src/proxy.conf.json` points the dev server at a backend on
`localhost:8080`, so run `make up` (or at least the `db` + `backend` services)
alongside `ng serve`.

---

## Make targets

| Target                | Effect                                                              |
| --------------------- | ------------------------------------------------------------------ |
| `make up` / `up-gpu`  | Build + start the stack (GPU variant for `ml_service`), wait for DB, migrate |
| `make down`           | Stop containers                                                    |
| `make re` / `re-gpu`  | `clean` then `up`                                                  |
| `make clean`          | Down + remove volumes and locally built images                     |
| `make logs` / `status`| Tail logs / list containers                                        |
| `make migrate`        | `sqlx migrate run` against the local DB                            |
| `make db-shell`       | psql shell into the DB container                                   |
| `make db-reset`       | `sqlx database reset -y` (drops + recreates + migrates)            |
| `make prepare`        | `sqlx prepare` (regenerate the offline query cache)               |
| `make showcase*`      | ML recommendation showcase (see above and the run book)           |

---

## More documentation

- [`back/ARCHITECTURE.md`](back/ARCHITECTURE.md) — backend map: modules, request lifecycle, ML round trip, data layer
- [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) — project audit against requirements
- [`front-end_structure.md`](front-end_structure.md) — frontend architecture
- [`module_tracking.md`](module_tracking.md) / [`changes.md`](changes.md) — progress notes
- `https://localhost/swagger-ui` — the authoritative HTTP contract, generated from the handlers
