# ML Showcase — Run Book

How to rebuild the recommendation showcase (249‑track catalogue, 15 personas) and
replay the "preference vectors drift every night" proof.

For the narrative of how this was built, see `B-SIDE_ML_SHOWCASE.md`. This file
is just the operational steps.

---

## TL;DR — reproducing yesterday's work on a fresh DB

Yesterday's result is **not a DB dump**. It's:

**(A) Repo state** — must be present on disk on eval day:

| Item | In git? | Action on eval day |
|---|---|---|
| Code changes (`analyzer.py`, `batch_analyze.py`, `upload-test-library.py`, `daily_mix_worker.rs`, `preferences.rs`, `docker-compose.yml`, `seed_ml_showcase.sql`) + the 3 new scripts | working tree now — **commit before eval day** | `git pull` / checkout the branch |
| `ml_cache/` (frozen vectors, ~250 files) | working tree now — **commit before eval day** | comes with the checkout |
| `scripts/songs/` (5.8 GB, 249 FLAC) | **no, git‑ignored** | restore from your archive (§1) |
| `ml_service` image with the baked‑in analyzer | image, rebuilt 2026‑09‑03 | `docker compose build ml_service` (§2) |

**(B) DB state** — rebuilt by running, in order:

```
make up                                  # fresh DB + migrations                (§3)
psql < back/seeds/full_seed.sql          # base users incl. admin               (§3)
python3 scripts/upload-test-library.py … # 249 songs -> 6-D vectors (cache hits)(§4)
psql < back/seeds/seed_ml_showcase.sql   # 15 personas + preference vectors     (§5)
python3 scripts/check-ml-showcase.py …   # verify each persona gets a Daily Mix (§5)
python3 scripts/prove-nightly-drift.py … # live: the nightly-drift demonstration(§6)
```

Steps 3–5 are deterministic (cache is frozen). Total ~5–10 min, no GPU.
Everything below is the detail for each step.

---

## 0. What the demo proves

1. **Real pipeline** — 249 FLAC go through `create → upload → verify → /analyze →
   callback`, ending with a 6‑D `songs.normalized_vector` per track.
2. **Personalisation** — 15 seeded personas (rock / electronic / classical‑ambient
   / pop / omnivores / 1 cold‑start) get visibly different Daily Mixes.
3. **Nightly drift** — a night of simulated listening moves a user's
   `preference_vector` and reshuffles their next Daily Mix; users who didn't
   listen don't move; the cold‑start user stays on `catalog_fallback`.

Model inference is **frozen** in `ml_cache/` (committed, ~250 files / 1.2 MB), so
the whole rebuild runs **without a GPU** in a few minutes. The GPU is only needed
to regenerate that cache (§6).

---

## 1. Where to put the songs

The catalogue is **not in git** — `scripts/songs/.gitignore` is `*` (5.8 GB, 249
FLAC). You have to store it yourself and restore it before a rebuild.

### Layout the scripts expect

```
scripts/songs/
  <Artist>/
    <Album>/
      1-01 Track Title.flac
      1-02 Track Title.flac
```

`Artist/Album/NN Title.flac`. Artist + album come from the two folder names,
title from the filename (leading `N-NN` / `NN -` track numbers are stripped).
There is **no ffprobe on this host**, so embedded tags are ignored — the folder
names *are* the metadata. Durations are stamped at 180 s and later backfilled
from `ml_cache/index.json`.

Current top‑level artist folders: ACDC, Artic Monkeys, Charlotte de Witte,
Chopin, Daft Punk, David Guetta, Djo, Gigi Perrez, Hans Zimmer, Ludovico
Einaudi, Red Hot Chilli Peppers, Taylor Swift.

### Storing it

Keep a single archive somewhere durable (external disk, private bucket — not
git, not a shared artifact):

```bash
# make the archive
tar -C scripts -cf ~/bside-showcase-songs.tar songs

# restore before a rebuild
tar -C scripts -xf ~/bside-showcase-songs.tar
```

> ⚠️ The frozen `ml_cache/` is keyed by the SHA‑256 of each track's **decoded
> 16 kHz mono signal**. It matches these exact files. If you re‑rip or
> re‑encode a track, its key changes → cache miss → that track needs real
> inference (§6). Keep the archive as the source of truth.

---

## 2. One‑time prerequisites

- Docker daemon running (native, no systemd): `sudo service docker start`
- `.env` at repo root with at least `DB_USER`, `DB_NAME`, `DB_PORT`,
  `PUBLIC_API_KEY`, `JWT_SECRET`, MinIO creds (see `.env.example`).
- `ML_RESULT_CACHE_DIR=/cache` + the `./ml_cache:/cache` mount are already wired
  into `docker-compose.yml` for `ml_service` — nothing to do, just don't remove
  them.
- The `ml_service` image already bakes in the analyzer's 429/5xx callback‑retry
  (rebuilt 2026‑09‑03). If `ml_engine/` changes, rebuild:
  `docker compose build ml_service`.

---

## 3. Bring the stack up

```bash
make up                       # build + migrate, CPU ml_service
# or, plain compose:
docker compose up -d --build
```

Apply the base seed (creates `admin@bside.local` etc., password `Password123!`):

```bash
docker exec -i bside_db_dev psql -U bside_admin -d bside_db < back/seeds/full_seed.sql
```

> `seed_ml_showcase.sql` does **not** depend on `full_seed.sql` — it creates its
> own 15 users. `full_seed.sql` is only needed here to get an admin account for
> the uploader. If `.env` has `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD`,
> the backend already bootstrapped an admin on startup and you can skip the base
> seed and log in with those instead.

> The Makefile drives compose as `sudo docker compose -p bside`. Bare
> `docker compose` also resolves the same project on this host — either is fine,
> just be consistent.

Check everything is up:

```bash
docker compose ps        # db, minio, ml_service, backend, frontend, nginx all Up
```

---

## 4. Load the catalogue

### 4.1 Get an admin token

```bash
export BSIDE_TOKEN=$(curl -k -s -X POST https://localhost/api/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@bside.local","password":"Password123!"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
```

(Or copy it from the browser console: `localStorage.getItem('auth_token')`.)

### 4.2 Upload

```bash
python3 scripts/upload-test-library.py \
  --root scripts/songs \
  --api https://localhost/api \
  --insecure
```

- Creates artists → albums (falls back to `scripts/defaults/default_cover.jpg`) →
  songs, PUTs each FLAC, hits `/verify` which queues `/analyze`.
- `/analyze` replays the frozen `ml_cache/` result instead of running models
  ("ML cache hit" in `docker compose logs ml_service`).
- Writes `showcase-upload-manifest.json`.
- Dry run first if you want: add `--dry-run`.

### 4.3 Wait for every track Ready + 6‑D

```bash
docker exec -i bside_db_dev psql -U bside_admin -d bside_db -c \
  "SELECT status, cardinality(normalized_vector) AS dims, count(*) \
   FROM songs GROUP BY 1,2 ORDER BY 1,2;"
```

Wait until it's all `Ready | 6`. If a handful are stuck `processing_ml`, the
callback got rate‑limited (429) mid‑burst — see §7.

---

## 5. Seed personas + verify

```bash
# 15 showcase users, pool-based interaction histories, real 6-D preference vectors
docker exec -i bside_db_dev psql -U bside_admin -d bside_db < back/seeds/seed_ml_showcase.sql

# smoke check: logs in showcase01..15, pulls each Daily Mix
python3 scripts/check-ml-showcase.py --api https://localhost/api --insecure
```

The seed aborts (`ON_ERROR_STOP`) if songs are missing or not 6‑D, so a clean run
means the catalogue is good. Personas are `showcase01@bside.local` …
`showcase15@bside.local`, password `Password123!`, `showcase15` is the
cold‑start user.

---

## 6. The nightly‑drift proof

One command runs the whole before/after:

```bash
python3 scripts/prove-nightly-drift.py \
  --day-one 2026-09-02 --day-two 2026-09-03 \
  --night 1 --insecure
```

What it does:

1. runs the Daily Mix worker for `--day-one` (which first calls
   `refresh_all_user_preferences`), snapshots each persona's `preference_vector`
   + mix;
2. runs `scripts/simulate-night.py --night 1` — a scripted burst of
   play/complete/replay/skip through the real interactions API;
3. runs the worker for `--day-two`, snapshots again, prints per‑persona
   `‖Δpref‖`, cosine, and how many mix songs changed.

Expected shape: 2–3 personas move noticeably (‖Δpref‖ ~0.1–0.2, ~10/20 mix songs
swapped), everyone else `0.0000` with an identical mix, cold‑start `cold-start`.

Nights are defined in `simulate-night.py` (`NIGHTS` dict — night 1 and night 2).
To replay a single worker pass by hand:

```bash
docker compose run --rm --no-deps daily-mix-worker \
  /app/daily_mix_worker --date 2026-09-03 --once
```

`--date YYYY-MM-DD` implies one‑shot.

---

## 7. Regenerating the frozen cache (GPU, rarely needed)

Only when the audio files change or you want to prove the models still run.
Needs the NVIDIA Container Toolkit + `nvidia` runtime (already in
`/etc/docker/daemon.json` on the original host). ~35 min for 249 tracks on an
RTX 4060; much slower on CPU.

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml run --rm \
  -v "$PWD/scripts/songs:/data:ro" \
  --entrypoint python ml_service \
  -m src.batch_analyze /data --out /cache
```

Writes `ml_cache/<signal_key>.json` + `ml_cache/index.json` on the host (via the
`./ml_cache:/cache` mount). Re‑run is incremental — existing keys are skipped
unless you pass `--reanalyze`. Commit the refreshed `ml_cache/` so the next
rebuild stays GPU‑free.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Cannot connect to the Docker daemon` | `sudo service docker start` (needs a real terminal for the sudo prompt — run it yourself). |
| Songs stuck `processing_ml`, ~10–15 missing vectors | Backend rate‑limits `/internal/songs/features`; a burst of analyses trips 429. The image now retries 429/5xx, but if it still happens re‑`/verify` the stuck songs or re‑run the uploader (idempotent on 409). |
| `simulate-night.py` fails partway with `login failed` / 429 | Login + interaction rate‑limiting, intermittent and pre‑existing. Just re‑run the script (or `prove-nightly-drift.py`). |
| `ml_service` logs `Could not load libcuda.so.1` / `cuInit: UNKNOWN ERROR` | Expected on the plain compose file — it's running CPU‑only. Fine for the demo (cache replay). Use the `-f docker-compose.gpu.yml` overlay only for §6. |
| Seed aborts with a cardinality / missing‑song error | Catalogue didn't finish analysing, or legacy 3‑D dev rows are present. Re‑check §4.3; the seed's step 0 flips non‑6‑D `Ready` songs to `Failed`. |
| Uploader: `Missing admin auth token` | `export BSIDE_TOKEN=…` (§4.1) or pass `--token`. |

---

## 9. File reference

| Path | Role |
|---|---|
| `scripts/songs/` | Catalogue, `Artist/Album/*.flac`. Git‑ignored — restore from your archive. |
| `ml_cache/` | Frozen analysis results + `index.json`. Committed. Keyed by decoded‑signal hash. |
| `scripts/upload-test-library.py` | Walks the tree, creates artist/album/song, uploads, verifies. |
| `ml_engine/src/batch_analyze.py` | Offline GPU batch analyser that writes `ml_cache/`. |
| `ml_engine/src/analyzer.py` | `/analyze` service. `_cached_features` replays the cache when `ML_RESULT_CACHE_DIR` is set; callback retries 429/5xx. |
| `back/seeds/seed_ml_showcase.sql` | 15 personas via artist/album pools, real 6‑D preference vectors. |
| `back/src/preferences.rs` | `refresh_all_user_preferences` — recompute every non‑banned user's vector. |
| `back/src/bin/daily_mix_worker.rs` | Loop worker; refreshes prefs before ranking; `--date YYYY-MM-DD` for replay. |
| `scripts/simulate-night.py` | Scripted listening burst per persona (`NIGHTS` dict). |
| `scripts/prove-nightly-drift.py` | Full before → simulate → after diff. |
| `scripts/check-ml-showcase.py` | Logs in showcase01..15, pulls each Daily Mix. |
