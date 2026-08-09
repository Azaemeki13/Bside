# Bside — Subject Compliance Audit

*Analysis only. No code was modified in the making of this document.*

**Context:** This project is 42's `ft_transcendence` ("Surprise." v21.1) common-core project, reskinned by the team as **Bside**, a music streaming platform (Rust/Axum backend, Angular frontend, Python/FastAPI ML service). The subject is deliberately open-ended: teams must clear a **14-point** module bar (Major = 2pts, Minor = 1pt) and satisfy a fixed set of mandatory/general/technical requirements. `module_tracking.md` self-reports 23/14 claimed points, but several of those claims are marked "Verify"/"WIP" by the team itself. This document re-derives status from the actual code (`back/src`, `front/src/app`, `ml_engine/src`, `infra/`, `docker-compose.yml`) as of 2026-08-08, cross-checked against the subject PDF (`en.subject.pdf`).

Status legend: ✅ Done &nbsp;·&nbsp; 🟡 Partial / at risk &nbsp;·&nbsp; ❌ Missing &nbsp;·&nbsp; ⬛ N/A (not applicable to this project)

---

## 0. Executive Summary

**Rejection-risk items (fix before anything else — the subject states these cause outright rejection or invalidate the mandatory part):**

1. **Privacy Policy / Terms of Service pages don't exist.** The footer (`front/src/app/landing/footer/footer.html`) links "Terms of Use", "Privacy Policy", "Legal Info" all to `href="#"`. There is no route, component, or content anywhere. The subject is explicit: *"Missing or inadequate Privacy Policy/Terms of Service pages will result in project rejection."*
2. **`README.md` does not meet the subject's mandatory README spec.** The current root `README.md` is the team's internal sprint tracker (roles, weekly checklists, curl test-account notes) — not the required document. Missing: the mandated italicized first line (*"This project has been created as part of the 42 curriculum by ⟨login1⟩..."*), and the required sections (Description, Instructions, Resources/AI-usage, Team Information, Project Management, Technical Stack, Database Schema, Features List, Modules with point justification, Individual Contributions).
3. **No `.env.example`.** The subject requires committing one alongside the git-ignored `.env`. Only `.env` exists.
4. **No HTTPS anywhere.** `infra/nginx/default.conf` is a 0-byte empty file, and no `nginx` service is even declared in `docker-compose.yml`. All traffic (browser→backend, backend→ML, backend→MinIO) is plain HTTP. The subject requires HTTPS for any browser/external connection to the backend.

**Point-tally risk:** Even taking the team's own module selection at face value, a strict re-count (Section 4) finds **~7–13 confidently-earned points against the 14 required**, because several claimed items have a concrete implementation gap that the subject's "fully functional or 0 points" evaluation rule would likely zero out:
- "Standard user management" (Major, 2pts) is undermined by a **still-broken avatar upload** (backend 500s — see §4.3).
- "Public API" (Major, 2pts) exists as a route surface but not as a coherent secured/rate-limited *public* API (see §4.1).
- "Backend as microservices" (Major, 2pts) is a thin two-service split, not a clear multi-service decomposition (see §4.7).

The strongest, least-disputable module is **AI → Recommendation system** (Major, 2pts): a genuinely-implemented content-based recommender using real Essentia audio features and a weighted interaction model, talking to a real second HTTP service. This is the project's best evaluation asset and is currently under-sold in the README.

---

## 1. Mandatory Part & General/Technical Requirements

| Requirement (subject Ch. III) | Status | Evidence |
|---|---|---|
| Web app with frontend + backend + database | ✅ | Angular (`front/`), Axum/Rust (`back/`), Postgres (`db` service) |
| Git: commits from all members, meaningful messages, work distribution | ✅ | 178 commits across ≥6 distinct people (`git shortlog`); note some contributors appear under two casings of the same name (`Ituriel`/`ituriel`, `Chloe Sauvage`/`chloé sauvage`) — worth reconciling for the README's "Individual Contributions" section |
| Containerized, single-command deploy | ✅ | `docker-compose.yml`: `db`, `adminer`, `minio`+`minio-setup`, `ml_service`, `backend`, `frontend` — `docker compose up` (or `make up`) starts everything |
| Latest Chrome compatibility, no console errors/warnings | 🟡 unverified | Not browser-tested in this audit; 7 stray `console.log` debug statements found in frontend services (`auth.service.ts`, `chat.service.ts`, `preferences.service.ts`) — not errors, but noise |
| Privacy Policy & Terms of Service, real content, accessible | ❌ | Dead `href="#"` footer links only, no pages exist — **rejection-critical**, see §0 |
| Multi-user support (concurrent users, no races/corruption) | 🟡 plausible, unverified | Architecture supports it (per-connection WS tasks, `Arc<Mutex<HashMap>>` online-user map in `network.rs`), but no load/race testing was done in this audit |
| Responsive, accessible frontend | 🟡 partial | Tailwind-based responsive layout; accessibility is thin (see §4.2) |
| CSS framework/styling solution | ✅ | Tailwind CSS (utility classes throughout templates) |
| `.env` git-ignored + `.env.example` provided | 🟡 half-done | `.env` exists and is git-ignored; **no `.env.example`** |
| Clear DB schema with defined relations | ✅ | 18 migrations, coherent evolution (auth → catalog → messaging → friendships → moderation → ML features/preferences) |
| Basic user management: secure signup/login | ✅ | Argon2 password hashing+salting (`auth.rs`), JWT issuance/validation, ban-aware auth middleware |
| Form validation (frontend + backend) | 🟡 partial | Backend validates file magic bytes/size for avatars and songs; frontend validates file type for uploads; general form-field validation (email format, password strength, etc.) not confirmed across all forms |
| HTTPS for all external connections | ❌ | No TLS/certs/443 anywhere; nginx config is empty and not even wired into `docker-compose.yml` — **rejection-relevant technical requirement unmet** |

---

## 2. README Compliance (subject Ch. VI)

The subject treats the README as a graded deliverable, not paperwork — "A poor or incomplete README can negatively impact your evaluation." Required vs. present:

| Required section | Present in current `README.md`? |
|---|---|
| Italicized first line naming all logins | ❌ |
| Description (goal, overview, name, key features) | ❌ (no product description at all — it's a sprint plan) |
| Instructions (prerequisites, setup, run steps) | 🟡 partial (docker/sqlx/cargo/npm commands exist, scattered; better versions live in `changes.md`) |
| Resources (references + how AI was used, for which tasks) | ❌ |
| Team Information (roles + responsibilities per member) | 🟡 partial (a role table exists but is sprint-oriented, not the PO/PM/Tech-Lead/Dev framing the subject requires) |
| Project Management (task org, tools, comms channel) | ❌ |
| Technical Stack + justification | ❌ |
| Database Schema (visual or described, tables/relations/fields) | ❌ |
| Features List (feature → owner → description) | ❌ |
| Modules list with point math + per-module justification | 🟡 exists in `module_tracking.md`, not in `README.md`, and not in the justification format the subject requires (especially for the "modules of choice" custom-module framing, which is currently unused — see §4.9) |
| Individual Contributions (detailed, per person, challenges faced) | ❌ |

**Net: the actual required README does not exist yet.** `module_tracking.md` and `changes.md` contain much of the raw material (module list, scoring table, setup commands, known bugs) but in the wrong shape and location.

---

## 3. Module-by-Module Status (subject Ch. IV)

### 3.1 Web

| Module | Pts | Status | Notes |
|---|---|---|---|
| Frontend + backend framework (Major) | 2 | ✅ | Angular + Axum |
| Real-time features via WebSockets (Major) | 2 | ✅ | `ws.rs`: shared `Arc<Mutex<HashMap<Uuid, Sender>>>`, chat + presence + friend-request push, graceful disconnect via `tokio::select!` |
| User interaction: chat + profile + friends (Major) | 2 | ✅ | Real WS chat with persistence/delivery status, friends add/remove/list, profile pages |
| Public API, secured + rate-limited + documented, 5+ endpoints (Major) | 2 | 🟡 at risk | No `/api/...` namespace (routes are flat); an API-key extractor exists but is consumed by only 2 of ~59 endpoints; rate limiting (`GovernorLayer`) is applied only to `public_routes`, **not** to the protected CRUD router; Swagger UI is live at `/swagger-ui` but is missing several real handlers from its spec. As specified ("a public API... with a secured API key, rate limiting, documentation, 5+ endpoints") this reads as a general authenticated API with an incomplete key/rate-limit layer bolted on, not a dedicated public API surface |
| Use an ORM (Minor) | 1 | ❌ | `sqlx` is a compile-time-checked query toolkit, not an entity-mapping ORM — every query is hand-written SQL |
| Notification system for all create/update/delete (Minor) | 1 | ❌ | Only ad hoc WS events for friend requests and chat; no generic CRUD notification system |
| Real-time collaborative features (Minor) | 1 | ⬛ | Not attempted, not relevant to this project |
| SSR (Minor) | 1 | ✅ | `angular.json` server build is real, and `front/src/server.ts` has genuine custom logic (proxies `/api` and `/ws` with upgrade handling) — not `ng new` boilerplate |
| PWA (Minor) | 1 | ❌ | No `@angular/service-worker`, no manifest, no offline support |
| Custom design system, 10+ reusable components (Minor) | 1 | 🟡 at risk | 33 reusable components exist (comfortably clears the 10-component bar), but there is no actual color-palette/typography token system — `styles.scss` is 9 lines, colors are hardcoded per-template as Tailwind arbitrary values (`bg-[#1F0E1C]`) rather than centralized. The subject asks for "a proper color palette, typography, and icons" — the component count is there, the *system* part is not |
| Advanced search: filters, sorting, pagination (Minor) | 1 | ❌ | `search.rs` does real Postgres full-text + trigram ranking (better than plain `ILIKE`), but there is no filter/sort/pagination — frontend is a live-typeahead dropdown only. `module_tracking.md` already flags this as "WIP"; confirmed still true |
| File upload & management system (Minor) | 1 | 🟡 partial | Multi-type (audio+cover+avatar), real client+server validation (magic bytes, size caps), presigned-URL secure storage, delete capability exists — but no upload progress indicator in the UI, and the song-delete route has an ownership bug (§5) that makes deletion unreliable for some users |

**Web subtotal, confident:** 8 pts (2+2+2+1 SSR). At-risk: Public API (2), design system (1), file upload (1) = 4 more if hardened.

### 3.2 Accessibility & Internationalization

| Module | Pts | Status | Notes |
|---|---|---|---|
| WCAG 2.1 AA compliance (Major) | 2 | ❌ | Only ~16 files use any `aria-*`/`role` attribute; no systematic landmark structure, skip links, or screen-reader pass found |
| Multi-language i18n, 3+ languages (Minor) | 1 | ❌ | No `@angular/localize`, `ngx-translate`, or locale files anywhere; not started |
| RTL support (Minor) | 1 | ❌ | No `dir="rtl"` or mirroring logic anywhere |
| Additional browser support, documented (Minor) | 1 | ❌ | No cross-browser test notes found |

**Subtotal: 0 pts.** This entire category is untouched — reasonable, since the team is clearing its 14 points elsewhere, but worth being deliberate about in the README (explicitly *not chosen*, rather than silently absent).

### 3.3 User Management

| Module | Pts | Status | Notes |
|---|---|---|---|
| Standard user management: profile update, avatar upload (w/ default), friends + online status, profile page (Major) | 2 | 🟡 at risk | Profile update, friends, online status, and profile pages all work. **Avatar upload is broken end-to-end**: `upload_avatar` expects `Extension<Claims>`, but nothing in the app ever inserts `Claims` into request extensions (`auth_gate` only reads `Claims` for the ban check and forwards the request unmodified) — the endpoint will fail on every call. The frontend side (`profile.ts` → `auth.service.ts`) is correctly built and will surface this as a runtime failure, not a missing feature. Since the module's own bullet list explicitly requires working avatar upload, this Major is not currently claimable as-is |
| Game statistics & match history (Minor) | 1 | ⬛ | Requires a game module; project has none |
| Remote auth via OAuth 2.0 (Minor) | 1 | ✅ | Real Google OAuth2: authorize → exchange code → fetch userinfo → upsert user → issue JWT (`handlers.rs`) |
| Advanced permissions system: CRUD users, roles, role-based views (Major) | 2 | ✅ | Shared `is_admin`/`is_admin_or_moderator`/`ensure_*` helpers; admin-gated `GET/PATCH/DELETE /admin/users/{id}`; the previously-known email/role/ban-status leak on `GET /users` is fixed (now returns a `PublicUser` subset) |
| Organization system (Major) | 2 | ❌ | No concept of organizations anywhere in the schema or code |
| Complete 2FA (Minor) | 1 | ❌ | No TOTP/2FA code found |
| User activity analytics dashboard (Minor) | 1 | ✅ | `GET /users/me/analytics` (plays, listened time, likes, unique songs, top 5, 30-day activity) rendered in a real "My Activity" settings panel |

**User Management subtotal, confident:** 4 pts (OAuth 1 + Advanced permissions 2 + Analytics 1). At-risk: Standard user management (2), currently blocked purely by one middleware bug.

### 3.4 Artificial Intelligence

| Module | Pts | Status | Notes |
|---|---|---|---|
| AI opponent for games (Major) | 2 | ⬛ | Requires a game module; none exists |
| RAG system (Major) | 2 | ❌ | Not implemented |
| LLM system interface (Major) | 2 | ❌ | Not implemented |
| Recommendation system using ML (Major) | 2 | ✅ | This is real and well-built: `ml_engine/src/analyzer.py` runs pretrained MusiCNN/Essentia models (danceability, mood, valence/arousal, tempo/key) on uploaded audio and posts feature vectors back to the Rust backend; `back/src/preferences.rs` computes weighted user-preference vectors from interactions (like/replay/complete/play/skip, matching `PREFERENCE_SYSTEM_README.md` exactly) and persists them; `back/src/recommendations.rs` serves `/fresh-picks` via cosine similarity between the user vector and each song's audio-feature vector. This is genuine content-based filtering with a real cross-service pipeline, not a stub |
| Content moderation AI (Minor) | 1 | ❌ | Not implemented |
| Voice/speech integration (Minor) | 1 | ❌ | Not implemented |
| Sentiment analysis (Minor) | 1 | ❌ | Not implemented |
| Image recognition/tagging (Minor) | 1 | ❌ | Not implemented (Essentia here does audio, not image, analysis) |

**AI subtotal:** 2 pts, and arguably the project's best-justified module. **Caveat:** the subject frames this bullet as "Collaborative filtering **or** content-based filtering" — the team has content-based, which qualifies — but the update mechanism is event-driven (recomputed synchronously after each interaction), not the batch/cron job the team's own `module_tracking.md` and Week-5 plan describe wanting. That's a deviation from the *plan*, not from the *subject requirement* — worth just correcting the README description accordingly rather than treating it as missing work.

### 3.5 Cybersecurity

| Module | Pts | Status | Notes |
|---|---|---|---|
| WAF/ModSecurity + HashiCorp Vault (Major) | 2 | ❌ | No trace anywhere in infra/compose |

**Subtotal: 0 pts.** Not attempted.

### 3.6 Gaming and User Experience

Not applicable — the team's product has no game, so the entire chapter (web-based game, remote players, multiplayer 3+, 3D graphics, advanced chat, tournaments, customization, gamification, spectator mode) is unclaimable by construction. This is a legitimate strategic choice (the subject explicitly allows non-game projects) but it does mean two dependent modules elsewhere (AI Opponent, Game stats/match history) are permanently closed off unless a game is added later.

### 3.7 DevOps

| Module | Pts | Status | Notes |
|---|---|---|---|
| ELK log management (Major) | 2 | ❌ | Not present |
| Prometheus + Grafana monitoring (Major) | 2 | ❌ | Not present |
| Backend as microservices (Major) | 2 | 🟡 at risk | There genuinely are two independent HTTP services talking over REST (Rust backend ↔ Python FastAPI/Essentia analysis service, `POST /analyze` and `POST /internal/songs/features`), which is more than a monolith. But the "ML recommendation" responsibility the subject imagines living in a service actually lives inside the Rust monolith (`preferences.rs`/`recommendations.rs`); the Python service's only job is audio-feature extraction. Two services each with a single responsibility is defensible as a minimal microservices claim, but it's thin relative to "design loosely-coupled services... each with a single responsibility" as a 2-point Major — expect this to be scrutinized in evaluation |
| Health check / status page + backups/DR (Minor) | 1 | ❌ | Only a bare `GET /ping`; no dashboard, no Docker healthchecks, no backup/restore automation |

**Subtotal:** 0 confident, 2 at-risk.

### 3.8 Data and Analytics

| Module | Pts | Status | Notes |
|---|---|---|---|
| Advanced analytics dashboard: interactive charts, real-time updates, export, date-range filters (Major) | 2 | ❌ | The "My Activity" panel (already counted under User Management's Minor analytics module) is a simple activity view, not an interactive/exportable/filterable dashboard — correctly *not* double-claimed by the team, but also not upgradeable into this Major without real additional work (charting library, export, filters) |
| Data export/import, multiple formats, bulk ops (Minor) | 1 | ❌ | Not implemented |
| GDPR compliance: data request/export/delete, confirmation emails (Minor) | 1 | ❌ | Not implemented — the only user-deletion capability is admin-initiated (`admin_delete_user_handler`), not self-service |

**Subtotal: 0 pts.**

### 3.9 Blockchain

Not attempted, not relevant to the product. 0 pts.

### 3.10 Modules of Choice

No custom module is currently declared or justified. **This is a missed opportunity**: the real Essentia-based audio-analysis pipeline feeding a live recommendation engine is a substantial, genuinely custom piece of engineering that goes beyond the standard "recommendation system" bullet (it's a full audio-content-understanding service, not just interaction-based collaborative filtering). Framing it explicitly as a justified "Modules of choice" Major in the README — on top of already claiming the AI recommendation Major — is not double-dipping only if the write-up frames a *distinct* technical contribution (e.g., "custom audio DSP/ML feature-extraction microservice using Essentia + MusiCNN" as the devops/architecture contribution, separate from the recommendation-algorithm contribution). Whether an evaluator accepts that framing is a judgment call, not a certainty — flag as worth discussing with peers before relying on it for points.

---

## 4. Point Tally (strict re-count)

| Category | Confidently earned | At risk (fixable) | Not attempted |
|---|---|---|---|
| Web | 8 | 4 (Public API 2, design system 1, file upload 1) | ORM 1, notifications 1, PWA 1, real-time collab 1, advanced search 1 |
| Accessibility & i18n | 0 | 0 | 5 (all) |
| User Management | 4 | 2 (Standard user mgmt) | Organization 2, 2FA 1 |
| AI | 2 | 0 | RAG 2, LLM 2, moderation/voice/sentiment/image 4 |
| Cybersecurity | 0 | 0 | 2 |
| DevOps | 0 | 2 (Microservices) | ELK 2, Prometheus/Grafana 2, health/backup 1 |
| Data & Analytics | 0 | 0 | 4 |
| Blockchain | 0 | 0 | 3 |
| **Total** | **14** | **8** | — |

The confident total lands **exactly at the 14-point bar**, with zero margin — and that count already assumes the strict re-reading above (e.g., not counting file-upload's progress-indicator gap, not counting design-system's missing palette). If an evaluator applies the subject's literal "non-functional or incomplete module = 0 points" rule to *any* of the four modules with a caveat baked into their "confident" bucket (Web frameworks/WS/interaction are solid; SSR is solid), the team is fine. But the moment "Standard user management" is graded as broken (avatar upload) or the "Public API" is scrutinized for its rate-limiting/key gaps, the count drops below 14 with only 8 at-risk points — currently unproven — to fall back on.

**This means the single highest-leverage engineering fix, purely from a grading standpoint, is fixing the avatar-upload `Claims` extension bug and hardening the Public API's rate limiting/key usage** — both are small, contained fixes, not new features, and both currently sit on the pass/fail line.

---

## 5. Concrete Defects Found (engineering reference, not part of the module tally above)

These are cited for follow-up; no code was changed.

- **Avatar upload broken**: `back/src/handlers.rs` `upload_avatar` takes `Extension<Claims>`, but no middleware inserts `Claims` into request extensions — every call fails. (`auth_gate` in `auth.rs` only extracts `Claims` transiently for the ban check.)
- **`DELETE /songs/{id}` ownership check bug**: still compares `albums.artist_id` directly against `claims.sub` (a user id) instead of joining through `artists.user_id`, as `changes.md` already documented. `DELETE /albums/{album_id}` was fixed the correct way (join to `artists.user_id`) — the same fix was never applied to songs.
- **Hard deletes, not soft deletes**: both song and album deletion do `DELETE FROM ...` immediately; the "mark Deleted, background cleanup task removes MinIO objects later" design described in `changes.md`/`module_tracking.md` does not exist in code. There is no cron/scheduled task anywhere in the Rust backend (`grep` for cron/interval/schedule found nothing beyond one-shot `tokio::spawn` calls for the ML request and per-connection WS tasks).
- **No `DELETE /artists/{id}`**, and **no `GET /songs`** list endpoint — both still missing, as `changes.md` flagged.
- **Rate limiting gap**: `GovernorLayer` (5 req/s/IP) is applied only to `public_routes`; the entire authenticated CRUD router has no rate limiting.
- **Hardcoded ML service URL**: `http://bside_ml_service:8000/analyze` is a literal string in `handlers.rs`, not read from an env var — fine for the current docker-compose network but a portability smell.
- **~25 `.unwrap()`/`.expect()` calls** remain in `back/src` outside of startup config; most are benign fail-fast boot-time expects, but a few are in request-handling paths (e.g. `upload_avatar`'s `field.content_type().expect(...)`, and email-parsing `.unwrap()`s in `contact_handler`) and could panic a request thread on malformed input — the subject explicitly calls out hunting down `.unwrap()` panics as a Week-6 task.
- **Dead code**: one clearly superseded, fully-commented-out component block (`front/src/app/components/progression-bar/progression-bar.ts`, lines 1–33) left in place per the team's "comment out as 'old version'" convention — harmless but worth pruning before evaluation for tidiness/console-noise reasons.
- **7 stray `console.log` debug statements** in frontend services (`auth.service.ts`, `chat.service.ts`, `preferences.service.ts`) — minor, but the subject explicitly checks for browser console cleanliness.

---

## 6. Recommended Priority Order

1. **Write real Privacy Policy and Terms of Service pages** and wire the footer links to them. This alone is a stated rejection criterion — no other module work matters if this stays undone.
2. **Rewrite `README.md`** to the subject's required shape (Ch. VI), pulling content from `module_tracking.md`/`changes.md` into the correct sections, adding the mandated first line, Team Information, Technical Stack, DB Schema, Features List, and Individual Contributions.
3. **Add `.env.example`.**
4. **Fix the avatar-upload middleware bug** — this single fix rescues an entire claimed Major module.
5. **Decide, deliberately, whether to hold the "Public API" and "Backend as microservices" Major claims** — either hardened (real `/api` namespace, rate limiting on protected routes too, complete Swagger coverage; a clearer service-responsibility split) or dropped in favor of a more defensible module (e.g. formalizing the "Modules of choice" custom pipeline write-up, or completing "Advanced search" filters/pagination, which is much less work than it looks given the full-text search backend already exists).
6. **Add HTTPS termination** (even a self-signed cert via the currently-empty nginx config) to satisfy the technical requirement and stand up the reverse proxy that's already planned but never wired in.
7. Polish pass: prune the dead commented-out component, clean the stray `console.log`s, fix the `DELETE /songs/{id}` ownership bug for consistency with the already-fixed album version.
