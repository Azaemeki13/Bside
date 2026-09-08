*This project has been created as part of the 42 curriculum by chsauvag, nacao, adi-marc, cauffret and didimitr *

# B-Side

## Description

B-Side is a music streaming platform built as our `ft_transcendence` project. Users can upload and stream music, build playlists, follow artists, interact socially with other users (friends, chat, profiles), and get personalized recommendations ("Daily Mix" / "Fresh Picks").

Key features:
- Streaming of songs, albums, and artist pages, with a persistent audio player.
- Playlists (create, edit, add/remove songs).
- Likes, recent plays, top spins, and a personalized "Daily Mix" / "Fresh Picks" recommendation feed.
- Social features: friends system, direct messaging, user profiles with avatars.
- Artist accounts and "become an artist" request/review workflow.
- File upload (song files, avatars) via S3-compatible object storage.
- Admin dashboard (user management, roles/bans, artist requests, analytics).
- Public API with API-key authentication and rate limiting, documented via Swagger/OpenAPI.
- Real-time features over WebSockets.
- Authentication via email/password (Argon2-hashed, salted) and Google OAuth2.

## Instructions

### Prerequisites

- Docker Engine and Docker Compose
- Rust toolchain (`rustc` / `cargo`)
- Node.js and `npm`
- A local `.env` file created from `.env.example`

### Environment configuration

Copy `.env.example` to `.env` and fill in the required values. The application configuration includes:

- PostgreSQL connection values (`DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `DATABASE_URL`)
- backend secret values (`JWT_SECRET`, `PUBLIC_API_KEY`)
- Google OAuth credentials (`OAUTH_ID`, `OAUTH_PW`, `G_AUTH_URL`, `G_TOKEN_URL`, `OAUTH_URL`)
- MinIO / S3-compatible storage settings (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ENDPOINT_URL`, `AWS_PUBLIC_ENDPOINT_URL`)
- admin bootstrap values (`ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`)
- SMTP credentials (`SMTP_USERNAME`, `SMTP_PASSWORD`)

### Running the project

1. Create the runtime environment file:
   - `cp .env.example .env`
2. Fill in the required values in `.env`.
3. Start the stack:
   - `make up`
   - or `docker compose up -d --build`
4. If needed, run migrations manually:
   - `make migrate`
5. Watch service logs:
   - `make logs`
6. The app is served behind the project nginx gateway, with the local entrypoint at `https://localhost`.
   - The local certificate is self-signed; accept it once in the browser on first use.
   - Google OAuth is configured for the callback URL `https://localhost/api/auth/google/callback`.

Notes from the repo setup:
- PostgreSQL runs in a `db` container.
- MinIO runs in a `minio` container and exposes the console on `http://localhost:9001`.
- Adminer is available on `http://localhost:8081`.
- The project includes a dedicated `daily_mix_worker` service for recommendation refreshes.
- Public legal pages are routed at `/terms-of-service` and `/privacy-policy`.

## Team Information

| Login    | Role(s) | Responsibilities |
|----------|---------|-------------------|
| chsauvag | Project Owner | Defined the product vision, prioritized features, and kept the project aligned with the intended user experience and scope. |
| nacao    | Full-stack Developer | Developed key backend and social features, worked on real-time messaging and recommendations, and contributed to frontend-backend integration. |
| adi-marc | Front-end Developer | Developed part of the front-end architecture in accordance with chsauvag vision and initial structure, structured the mobile and responsive aspect of the application as well as the main features of the player. |
| cauffret | Back-end Developer | Visualized and developed the main back-end architecture in Rust as well as the ML engine and the various connections between the server side services. |
| didimitr | Back-end Developer | In charge of the ML engine in accordance with cauffret's architecture sketch for the taste algorithm and the daily-mix recomendations. |

## Project Management

- **Task organization**: Tasks were assigned based on each member's interests, skills, and areas they wanted to develop further.
- **Communication channel**: Discord.
- **Meeting cadence**: At least once every two weeks.

## Technical Stack

- **Frontend**: Angular (with Server-Side Rendering), SCSS + Tailwind CSS
- **Backend**: Rust
- **Database**: PostgreSQL
- **Authentication**: JWT, Argon2 password hashing, Google OAuth2
- **File storage**: S3-compatible object storage via `aws-sdk-s3` / MinIO
- **API documentation**: Swagger UI via `utoipa`
- **Rate limiting**: `axum-governor`
- **Other notable libraries/tools**:
  -

**Justification for major technical choices:**
-

## Database Schema

The codebase is built around a relational model with the following core entities:

- `users` and authentication/account metadata
- `artists` and `albums`
- `songs` with metadata, analysis state, and ML feature vectors
- `playlists` and `playlist_songs`
- `likes`, recent plays, and analytics counters
- `friendships` / friend requests
- `messages` / conversations for direct messaging
- `artist_requests` for the artist onboarding workflow
- `daily_mixes` and per-user recommendation state
- moderation/admin records such as user bans and role management

## Features List

| Feature | Description | Contributor(s) |
|---------|--------------|-----------------|
| Streaming & catalog (songs, albums, artists) | Music catalog browsing, artist/album pages, and playback endpoints for songs and audio URLs. | chsauvag |
| Playlists | CRUD for playlists and song membership, including a special liked-songs playlist flow. | chsauvag |
| Likes / recent plays / top spins | User interaction tracking and analytics for liked songs, plays, and popularity statistics. | chsauvag |
| Daily Mix / recommendations | Personalized recommendation generation and scheduled refresh jobs for daily mixes. | |
| Social (friends, messaging, profiles) | Friend requests, friend list management, user profiles, and direct messaging with live WebSocket updates. | chsauvag |
| File upload (songs, avatars) | Upload handling with S3-compatible object storage and URLs for song/cover/avatar assets. | |
| Admin panel (users, roles, bans, artist requests) | Moderation and admin routes for user management, role changes, bans, and artist request review. | |
| Public API (with API key, rate limiting, Swagger docs) | Public API endpoints protected by API-key auth, with rate limiting and OpenAPI documentation. | |
| Real-time features (WebSockets) | WebSocket event types for private messages, friend activity, and other live updates. | |
| Authentication (email/password + Google OAuth) | Local account registration/login with Argon2 password hashing and Google OAuth callback flow. | chsauvag |
| Analytics dashboard | Read endpoints for recent plays, top spinning songs, and user activity analytics. | |
| Search | Filtered and paginated search across songs, albums, artists, and playlists. | |
| Privacy Policy / Terms of Service pages | Project includes endpoints and pages for privacy/legal content. | |

## Modules

| Module | Type | Points | Justification | Contributor(s) |
|--------|------|--------|----------------|------------------|
| Frontend + backend framework | Major | 2 | Angular frontend and Rust/Axum backend are implemented as the main application stack. | chsauvag, |
| Real-time features via WebSockets | Major | 2 | The project includes live chat, presence, and friend-related real-time updates over WebSockets. | chsauvag, |
| User interaction: chat + profile + friends | Major | 2 | Users can chat, manage friendships, view profiles, and see online presence. | chsauvag, |
| Recommendation system using ML | Major | 2 | The backend integrates an ML audio-analysis service and generates personalized recommendations from user interaction and audio feature vectors. | |
| Remote auth via OAuth 2.0 | Minor | 1 | Google OAuth 2.0 login is implemented and integrated with user creation/authentication. | |
| Advanced permissions system | Major | 2 | Admin and moderator role checks are implemented for user management and restricted routes. | |
| User activity analytics dashboard | Minor | 1 | User analytics for recent activity, likes, listening trends, and top songs are exposed and displayed. | |

**Total points: 14**

## Individual Contributions

### chsauvag
- Came up with the original product idea and defined the overall vision for the project.
- Designed the initial product direction and user experience through interface exploration and mockups in Figma.
- Contributed heavily to the frontend implementation, working alongside adi-marc on the main UI and feature development.
- Worked on frontend services, state management, data integration, and application logic to connect the interface to the backend.
- Helped keep the project aligned with the intended user experience and overall product goals.

### nacao
- Worked mainly on backend development, with a strong focus on the social and real-time features of the application.
- Implemented direct messaging and real-time communication using WebSockets.
- Contributed to the friendship system, including friend requests and friend management.
- Worked on message persistence, conversation history, and read/unread message handling.
- Contributed to the recommendation system by implementing user preference calculation based on listening interactions.
- Worked on PostgreSQL migrations and SQLx integration for the features I developed.

### adi-marc
- Worked on all aspects of the front-end by implementing features from a visual mockup, adjusting already build sections and finding solutions for specific section layouts.
- Designed and implemented the responsive features from an already built destkop MVP, restructured the desktop sections to adapt them to a mobile and tablet view.
- Built part of the front-end logic by building the howler.js player and it's main functionalities. 
- Fixed the connections with the various back-end API in collaboration with chsauvag.
- Advised various changes from the initial design concept to adapt the artistic vision without damagin the User Experience.

## Challenges Faced

### chsauvag
- Working with languages and technologies that I did not know before, which meant learning a large part of the stack from scratch.
- Over-scoping the project at the beginning, which created extra complexity and pressure later on.
- Struggling with the responsibilities of the Product Owner role and finding the right balance between product decisions and technical reality.
- Experiencing communication issues at the start of the project, which made early coordination and alignment harder.

### nacao
- Learning Rust and Axum while implementing asynchronous and real-time features was one of the main challenges.
- Managing WebSocket connections and keeping real-time messages synchronized with the database and frontend required careful handling. 
- Working across both the backend and frontend made it important to keep API models, WebSocket payloads, and application state consistent. 
- Designing the recommendation-related logic was challenging because different user interactions had to be translated into meaningful preference scores. 
- Integrating several features developed by different team members also required regular coordination and adaptation as the project evolved.

### adi-marc
- Learning new frameworks and adapting them to a complex project from the beginning, as well as having multiple languages work with eachother.
- Adapting the project to it's evolving vision, changing complete features or specific sections of the UI to comply with the evolution of the application.
- Working with a partner on the same field (Front-end) and having to adapt the code with sections that weren't written by me.
- Adapting a Desktop first UI to the mobile and tablet views without losing details or features.

## Resources

- [Axum documentation](https://docs.rs/axum)
- [SQLx documentation](https://docs.rs/sqlx)
- [Angular documentation](https://angular.dev)
- [utoipa (OpenAPI for Rust)](https://docs.rs/utoipa)

### AI usage

- [ ] *(describe which tasks AI was used for and which parts of the project it touched)*
