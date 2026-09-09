*This project has been created as part of the 42 curriculum by chsauvag, nacao, adi-marc, cauffret and didimitr*

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
| chsauvag | Project Owner / Front-end Developer | Defined the product vision, prioritized features, and kept the project aligned with the intended user experience and scope. |
| nacao    | Full-stack Developer | Developed key backend and social features, worked on real-time messaging and recommendations, and contributed to frontend-backend integration. |
| adi-marc | Project Manager / Front-end Developer | Developed part of the front-end architecture in accordance with chsauvag vision and initial structure, structured the mobile and responsive aspect of the application as well as the main features of the player. |
| cauffret | Technical Lead / Back-end Developer | Visualized and developped the main back-end architecture in Rust as well as the ML engine and the various connections between the server side services. |
| didimitr | Back-end Developer | In charge of the ML engine in accordance with cauffret's architecture sketch for the taste algorithm and the daily-mix recommndations. |

## Project Management

- **Task organization**: Tasks were assigned based on each member's interests, skills, and areas they wanted to develop further.
- **Communication channel**: Discord.
- **Meeting cadence**: At least once every two weeks.

## Technical Stack

- **Frontend**: Angular (with Server-Side Rendering), SCSS + Tailwind CSS
- **Backend**: Rust , tokio framework, python fastAPI and librosa
- **Database**: PostgreSQL
- **Authentication**: JWT, Argon2 password hashing, Google OAuth2
- **File storage**: S3-compatible object storage via `aws-sdk-s3` / MinIO
- **API documentation**: Swagger UI via `utoipa`
- **Rate limiting**: `axum-governor`
- **Other notable libraries/tools**: essentia / fastAPI 

**Justification for major technical choices:**
- Rust is a safe at compilation time language which makes it good for this project, if it compiles it will work. 
It also has a very good hashing library and is getting more and more popular therefore the choice, also it's fun to be a rustacean ! :-) 
- Angular is one of the most popular frontend languages at the moment used by giants such as Google, made sense to include it in the project.
- Python is the main language when it comes to AI manipulation and it's the native code so we don't need to use wrappers as our needs are already quite specific, essentia.

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
| Streaming & catalog (songs, albums, artists) | Music catalog browsing, artist/album pages, and playback endpoints for songs and audio URLs. | chsauvag / adi-marc / cauffret |
| Playlists | CRUD for playlists and song membership, including a special liked-songs playlist flow. | chsauvag / adi-marc / cauffret |
| Likes / recent plays / top spins | User interaction tracking and analytics for liked songs, plays, and popularity statistics. | chsauvag / didimitr / adi-marc |
| Daily Mix / recommendations | Personalized recommendation generation and scheduled refresh jobs for daily mixes. | didimitr / cauffret |
| Social (friends, messaging, profiles) | Friend requests, friend list management, user profiles, and direct messaging with live WebSocket updates. | chsauvag / adi-marc / ncao |
| File upload (songs, avatars) | Upload handling with S3-compatible object storage and URLs for song/cover/avatar assets. | cauffret / adi-marc |
| Admin panel (users, roles, bans, artist requests) | Moderation and admin routes for user management, role changes, bans, and artist request review. | chsauvag / cauffret / adi-marc |
| Public API (with API key, rate limiting, Swagger docs) | Public API endpoints protected by API-key auth, with rate limiting and OpenAPI documentation. | cauffret / nacao |
| Real-time features (WebSockets) | WebSocket event types for private messages, friend activity, and other live updates. | ncao |
| Authentication (email/password + Google OAuth) | Local account registration/login with Argon2 password hashing and Google OAuth callback flow. | cauffret / chsauvag |
| Analytics dashboard | Read endpoints for recent plays, top spinning songs, and user activity analytics. | chsauvag / cauffret / adi-marc |
| Search | Filtered and paginated search across songs, albums, artists, and playlists. | cauffret / adi-marc / chsauvag |
| Privacy Policy / Terms of Service pages | Project includes endpoints and pages for privacy/legal content. | adi-marc / cauffret |
| Machine learning  | Vector of preferences that are uploaded using users interactions with the song, and are updated every night | adi-marc / cauffret |
| Sentiment on songs  | Songs are analysed by an essentia model that gives both mechanical (bpm, arrousal) and trained weight to the songs | adi-marc / cauffret |



## Modules

| Module | Type | Points | Justification | Contributor(s) |
|--------|------|--------|----------------|------------------|
| Frontend + backend framework | Major | 2 | Angular frontend and Rust/Axum backend are implemented as the main application stack. | chsauvag / cauffret / adi-marc / nacao / didimitr |
| Real-time features via WebSockets | Major | 2 | The project includes live chat, presence, and friend-related real-time updates over WebSockets. | chsauvag / cauffret / nacao |
| User interaction: chat + profile + friends | Major | 2 | Users can chat, manage friendships, view profiles, and see online presence. | chsauvag / adi-marc |
| Recommendation system using ML | Major | 2 | The backend integrates an ML audio-analysis service and generates personalized recommendations from user interaction and audio feature vectors. | cauffret / nacao / didimitr |
| Remote auth via OAuth 2.0 | Minor | 1 | Google OAuth 2.0 login is implemented and integrated with user creation/authentication. | cauffret |
| Advanced permissions system | Major | 2 | Admin and moderator role checks are implemented for user management and restricted routes. | cauffret / nacao |
| User activity analytics dashboard | Minor | 1 | User analytics for recent activity, likes, listening trends, and top songs are exposed and displayed. | chsauvag / didimitr / adi-marc |
| Public API | Major | 2 | 5 endpoints GET POST PUT DELETE, have rate limiting with governor, documentation with utoipa |  cauffret / ncao |
| Advanced Search | Minor | 1 | have filter (in searchbar), sorting (when displayed) and pagination(in searchbar) | cauffret / adi-marc |
| Standard User Management | Major | 2 | Users can update profile, avatar, add other friends and see status, + they have their profile page. |  cauffret / ncao |
| File upload & management | Minor | 1 | Can upload album pictures and also sounds, both verified in front & back. Safely stored in MinIO and access control with s3 links. Have indicator when doing it from the admin page, we can also delete uploaded files. |  cauffret / chsauvag / didimitr |
| SSR | Minor | 1 | server.ts and output mode is server | cauffret / adi-marc |
| Backend as microservices | Major | 2 | Services are loosely-coupled with clear interfaces (API has utoipa, ML serivce has the scripts, Daily-mix worker as well), they use rest API to communcicate with each an other. And every service has its own responsibility. You can be judge though, they're all contained in the rust crate. | cauffret / ncao / didimitr |

**Total points: 22**

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
- Worked on all aspects of the front-end by implementing features from a visual mockup, adjusting already built sections and finding solutions for specific sections' layouts.
- Designed and implemented the responsive features from an already built desktop MVP, restructured the desktop sections to adapt them to a mobile and tablet view.
- Built part of the front-end logic by building the howler.js player and its main functionalities.
- Fixed the connections with the various back-end APIs in collaboration with chsauvag.
- Advised various changes from the initial design concept to adapt the artistic vision without damaging the User Experience.

### didimitr
- Built the song analysis pipeline including mechanical and trained analysis with Python fastAPI.
- Built the Daily Mix generator: a persistent 20-track daily playlist mixing familiar favourites with fresh discovery picks.
- Ranked tracks by cosine similarity to each user's preference vector, with per-artist and per-album diversity caps.
- Built the scheduled daily_mix_worker that refreshes preference vectors nightly and regenerates missing mixes.
- Developed the personalized "Fresh Picks" album recommendations, with ML mood filtering and a catalogue fallback.
- Integrated the ML audio-analysis output into ranking and wired the Angular/Axum endpoints serving mixes.

### cauffret
- Came up with data relation schema
- Designed CRUD functionalities
- Designed authentication functionalities.
- Contributed to the AI design.
- Worked on API integration and front / back integration.
- Kept best practices on the project.

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
- Learning new frameworks and adapting them to a complex project from the beginning, as well as having multiple languages work with each other.
- Adapting the project to its evolving vision, changing complete features or specific sections of the UI to comply with the evolution of the application.
- Working with a partner in the same field (front-end) and having to adapt the code to sections that weren't written by me.
- Adapting a desktop-first UI to mobile and tablet views without losing details or features.

### didimitr
- Learning Rust, async SQLx, and audio-vector math at once while building a full recommendation feature from scratch.
- Making Daily Mix generation idempotent so concurrent requests and the nightly worker never create duplicate or half-written mixes.
- Keeping recommendations useful for brand-new users with no listening history, which required catalogue fallbacks at every ranking stage.
- Tuning the discovery-versus-familiar balance and diversity caps so even a narrow catalogue still fills a complete 20-track mix.
- Coordinating the preference-vector logic with cauffret and the audio feature-vector format with the Python ML service.

### cauffret
- Rust, but not basic syntax, the "modern" way to write code.
- Framework programming.
- Futures, and asynch programming.
- Web programming, with ports communication.
- At some point working with 4 languages, jscript, rust, python, postgresql.
- Huge project, hard to stay focused on one direction

## Resources

- [Axum documentation](https://docs.rs/axum)
- [SQLx documentation](https://docs.rs/sqlx)
- [Angular documentation](https://angular.dev)
- [utoipa (OpenAPI for Rust)](https://docs.rs/utoipa)
- [FastAPI documentation](https://fastapi.tiangolo.com/)
- [Librosa introduction video](https://youtu.be/ZqpSb5p1xQo?si=mktw9Hm0XFj_D478)
- [Librosa documentation](https://librosa.org/doc/latest/index.html)
- [Essentia python Documentation](https://essentia.upf.edu/essentia_python_tutorial.html)
- [Encryption, Hashjing and Salting](https://www.geeksforgeeks.org/computer-networks/encryption-vs-hashing-vs-salting/)
- [Litterature concerning DEAM dataset](A. Aljanaki, Y.-H. Yang, M. Soleymani, "Developing a benchmark for emotional analysis of music," PLoS ONE, 2017)


### AI usage

- [x] (cauffret) To understand syntax and having things explained, if you don't get it go check how good is rust documentation. 
- [x] (cauffret) To help me designing the unit tests 
 