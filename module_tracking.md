# ft_transcendence — Modules Checklist

**Legend:** ✅ Done &nbsp;|&nbsp; 🟡 In progress &nbsp;|&nbsp; ⚠️ Broken/at risk &nbsp;|&nbsp; ❌ Not started/cut
**Scoring:** Major = 2pts, Minor = 1pt, 14 required to pass. Bonus (max +5) only counts once 14 is validated.

## Web
| Module | Type | Status | Owner | Notes |
|---|---|---|---|---|
| Frontend + backend framework (both) | Major (2) |Done| | |
| Real-time features (WebSockets) | Major (2) |Verify but done| | |
| User interaction (chat + profile + friends) | Major (2) |To verify remove friends| | |
| Public API (secured, rate-limited, documented, 5+ endpoints) | Major (2) |Verify| | |
| Advanced search (filters, sort, pagination) | Minor (1) |WIP| | |
| File upload & management system | Minor (1) |Verify client side vérifier delete back & front| | |

## User Management
| Module | Type | Status | Owner | Notes |
|---|---|---|---|---|
| Standard user management & auth (profile, avatar, friends, online status) | Major (2) |✅ Done| | Update display name, avatar upload (client-side default fallback), friends + real online status all wired end-to-end. Settings sidebar notification/status-sharing toggles are still cosmetic-only stubs (not a subject requirement, just a UX gap). |
| Remote auth (OAuth 2.0) | Minor (1) |✅ Done| | Real Google OAuth2 flow, verified. |
| Advanced permissions system (roles/CRUD) | Major (2) |✅ Done| | Fixed: GET /users and /users/{id} were leaking every user's email/role/ban status to any authenticated user — now return a public-safe subset; full records moved to admin-gated GET /admin/users. Added missing edit (PATCH /admin/users/{id}, role + display name) and delete (DELETE /admin/users/{id}, blocks deleting artists/self) endpoints to complete CRUD. Added Moderator role (view-only on admin user list) alongside Admin/User, with a shared role-check helper replacing 5 duplicated ad-hoc checks (also fixed a real bug in delete_album_handler where owner-or-admin was checked with \|\| instead of &&, allowing only owner+admin together). |
| User activity analytics dashboard | Minor (1) |✅ Done| | Was not implemented at all despite being marked done on the frontend — no aggregation endpoint existed and there was no dashboard component anywhere. Added GET /users/me/analytics (total plays, listened time, likes, unique songs, top 5 songs, 30-day daily activity) and a new "My Activity" panel under Settings rendering it. |

## Artificial Intelligence
| Module | Type | Status | Owner | Notes |
|---|---|---|---|---|
| ML recommendation system | Major (2) | collecter les interactions utilisateur, stocker les préférences, calculer les poids, choisir quand mettre à jour la matrice de préférence et concevoir l’API de recommandation + cronjob| | |

## DevOps
| Module | Type | Status | Owner | Notes |
|---|---|---|---|---|
| Backend as microservices | Major (2) |A verifier| | |
---

## Score Tally
- **Majors claimed × 2:** 8
- **Minors claimed × 1:** 5
- **Total:** 23 / 14 required
- **Bonus beyond 14** (max +5): 19
