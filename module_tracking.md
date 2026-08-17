# ft_transcendence — Modules Checklist

**Legend:** ✅ Done &nbsp;|&nbsp; 🟡 In progress &nbsp;|&nbsp; ⚠️ Broken/at risk &nbsp;|&nbsp; ❌ Not started/cut
**Scoring:** Major = 2pts, Minor = 1pt, 14 required to pass. Bonus (max +5) only counts once 14 is validated.

## Web
| Module | Type | Status | Owner | Notes |
|---|---|---|---|---|
| Frontend + backend framework (both) | Major (2) | ✅ Done | | Angular frontend and Axum backend; both builds verified. |
| Real-time features (WebSockets) | Major (2) | ✅ Done | | JWT-authenticated WebSocket chat with reconnect handling, bounded frames, and multi-device connection fan-out/presence. |
| User interaction (chat + profile + friends) | Major (2) | ✅ Done | | Persistent messages, profiles, friendships, requests, and live events. |
| Public API (secured, rate-limited, documented, 5+ endpoints) | Major (2) | ✅ Done | | Five API-key-secured artist CRUD endpoints, isolated API-managed writes, 5 req/s limiting, validation, pagination, and OpenAPI/Swagger documentation. |
| Advanced search (filters, sort, pagination) | Minor (1) | ✅ Done | | Server-side entity filters, relevance/name sorting, bounded pagination metadata, and actionable song/album/artist/playlist results. |
| File upload & management system | Minor (1) | ✅ Done | | Presigned uploads, full-object size validation, file-signature validation, ownership checks, deletion, and frontend upload UI. |

## User Management
| Module | Type | Status | Owner | Notes |
|---|---|---|---|---|
| Standard user management & auth (profile, avatar, friends, online status) | Major (2) | ✅ Done | | Profile updates, validated avatar upload/default, friends, and online status are implemented; live evaluation still required. |
| Remote auth (OAuth 2.0) | Minor (1) | ✅ Done | | Google OAuth2 with validated CSRF state, verified-email enforcement, secure callback cookie, and fragment-based token handoff. |
| Advanced permissions system (roles/CRUD) | Major (2) |✅ Done| | Fixed: GET /users and /users/{id} were leaking every user's email/role/ban status to any authenticated user — now return a public-safe subset; full records moved to admin-gated GET /admin/users. Added missing edit (PATCH /admin/users/{id}, role + display name) and delete (DELETE /admin/users/{id}, blocks deleting artists/self) endpoints to complete CRUD. Added Moderator role (view-only on admin user list) alongside Admin/User, with a shared role-check helper replacing 5 duplicated ad-hoc checks (also fixed a real bug in delete_album_handler where owner-or-admin was checked with \|\| instead of &&, allowing only owner+admin together). |
| User activity analytics dashboard | Minor (1) |✅ Done| | Was not implemented at all despite being marked done on the frontend — no aggregation endpoint existed and there was no dashboard component anywhere. Added GET /users/me/analytics (total plays, listened time, likes, unique songs, top 5 songs, 30-day daily activity) and a new "My Activity" panel under Settings rendering it. |

## Artificial Intelligence
| Module | Type | Status | Owner | Notes |
|---|---|---|---|---|
| ML recommendation system | Major (2) | ✅ Done | | Interaction-weighted preference vectors, ML audio embeddings, Fresh Picks album discovery, and persistent scheduled Daily Mix. |

## DevOps
| Module | Type | Status | Owner | Notes |
|---|---|---|---|---|
| Backend as microservices | Major (2) | ⚠️ Partial / evaluation risk | | Rust API, Python ML service, and worker are separate containers, but the worker shares the database/code and service boundaries need stronger interface evidence. |
---

## Strict verified score tally

- **Complete major modules:** 7 × 2 = 14 points
- **Complete minor modules:** 4 × 1 = 4 points
- **Strict total:** **18 / 14 required**
- **Current buffer above threshold:** 4 points
- Backend as microservices remains partial and is not counted.
