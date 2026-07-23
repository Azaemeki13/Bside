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
| Standard user management & auth (profile, avatar, friends, online status) | Major (2) |Les users doivent pouvoir update leurs infos et changer avatar On doit aussi relier les settings a des trucs qui marchent| | |
| Remote auth (OAuth 2.0) | Minor (1) |Done| | |
| Advanced permissions system (roles/CRUD) | Major (2) |Admin qui peut ban des users mais mis a part ça done | | |
| User activity analytics dashboard | Minor (1) |avec ai plus postgresql a vérifier dans le back dans le front c good | | |

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
