# ft_transcendence: Music Streaming Platform Roadmap

**Duration:** 1.5 Months (6 Weeks)
**Team Size:** 4 Members (2 Core Developers + 2 Project Management/QA roles to meet subject requirements)
**Target:** 14 Points

---

## 🎯 Module Point Breakdown (14 Points Total)

### The Web Core (3 Points)
- **[Major - 2pts]** Use a framework for frontend (React/Vue) and backend (Go).
- **[Minor - 1pt]** Use an ORM (e.g., GORM) for the database.

### The Music Features (4 Points)
- **[Major - 2pts]** Recommendation system using Machine Learning (Collaborative filtering via Python).
- **[Minor - 1pt]** File upload and management system (AWS S3 / MinIO integration).
- **[Minor - 1pt]** Advanced search functionality (SQL `ILIKE` / Full-Text Search).

### The Social & User Features (6 Points)
- **[Major - 2pts]** User interaction (Real-time Chat, Friends system, Online status).
- **[Major - 2pts]** Standard user management (Avatars, profiles, settings).
- **[Major - 2pts]** Advanced analytics dashboard (Interactive track data visualization).

### The Polish (1 Point)
- **[Minor - 1pt]** Remote authentication (OAuth 2.0 via 42 API or Google).

---

## 👥 Team Repartition

| Member | Role | Responsibilities |
| :--- | :--- | :--- |
| **Developer A** | **Backend & Engine** | Go API, PostgreSQL schemas, WebSockets Hub, Python ML microservice, Docker & DevOps. |
| **Developer B** | **Frontend & UI/UX** | React/Vue SPA, Howler.js audio engine, UI components, WebSocket client, Analytics charts. |
| **Dummy 1** | **Product Owner / Scrum** | Documentation (`README.md`), Privacy Policy, Terms of Service, Sprint management. |
| **Dummy 2** | **QA & Accessibility** | End-to-end testing, UI mockups, Accessibility (a11y) audits. |



---

## 🚀 6-Week Sprint Protocol

### Week 1: The Foundation (Infrastructure & Schemas)
**Goal:** Both developers can run the app locally, and the database is ready.

**Developer A (Backend):**
- [ ] Write `docker-compose.yml` for PostgreSQL, PgAdmin, and Go.
- [ ] Initialize Go project and configure ORM.
- [ ] Design and migrate database schemas (`Users`, `Tracks`, `Playlists`, `Interactions`).
- [ ] Setup base HTTP router (Gin/Fiber).

**Developer B (Frontend):**
- [ ] Initialize React/Vue frontend (Vite).
- [ ] Setup UI component library (Tailwind/MUI) and routing.
- [ ] Create Figma wireframes for core views.
- [ ] Build the empty shell of the Audio Player pinned to the viewport bottom.

---

### Week 2: Core Hardware (Uploads, Auth, & Streaming)
**Goal:** A user can log in, securely upload an audio file, and stream it back.

**Developer A (Backend):**
- [ ] Build standard JWT Auth endpoints (Register/Login).
- [ ] Implement OAuth 2.0 flow.
- [ ] Build AWS S3 Pre-Signed URL generator.
- [ ] Build track metadata `POST` endpoint to save S3 links to PostgreSQL.

**Developer B (Frontend):**
- [ ] Build Auth UI (Login/Register).
- [ ] Build Drag-and-Drop file upload component (requests Pre-Signed URL $\to$ `PUT` to S3).
- [ ] Implement `Howler.js` (or native Audio) to play the S3 stream.
- [ ] Add Play/Pause controls and progress bar to the Audio Player.

---

### Week 3: The Memory Bank (Profiles, Playlists, & Search)
**Goal:** Users can manage their identity and organize their music.

**Developer A (Backend):**
- [ ] Build User Management endpoints (Update avatar, username).
- [ ] Build Playlist CRUD operations.
- [ ] Build Advanced Search endpoint (querying tracks/artists).

**Developer B (Frontend):**
- [ ] Build User Profile and Settings UI.
- [ ] Build Playlist UI and integrate audio queue (auto-play next song).
- [ ] Build Global Search bar and results view.

*🚨 **MID-SPRINT SECURITY CHECK:** Ensure audio streams smoothly and DB saves correctly before moving to WebSockets.*

---

### Week 4: The Network (Real-Time Chat & Interactions)
**Goal:** Satisfy the 42 "User Interaction" real-time requirements.

**Developer A (Backend):**
- [ ] Set up Go WebSocket Hub.
- [ ] Implement Friends system (Send/Accept requests).
- [ ] Implement real-time direct messaging routing.
- [ ] Broadcast "User Online/Offline" status.

**Developer B (Frontend):**
- [ ] Build Friends List UI with online/offline indicators.
- [ ] Build real-time Chat Window UI.
- [ ] Connect WebSocket client to send/receive messages.

---

### Week 5: The Intelligence (Machine Learning & Analytics)
**Goal:** Hit the final major modules for the 14-point threshold.

**Developer A (Backend):**
- [ ] Write Go endpoint to aggregate play counts and likes.
- [ ] Initialize Python FastAPI microservice.
- [ ] Write Collaborative Filtering algorithm (`scikit-learn`) reading from Postgres.
- [ ] Expose `/recommendations/{user_id}` endpoint.

**Developer B (Frontend):**
- [ ] Ensure player fires "Play (>30s)" and "Like" events to the backend.
- [ ] Integrate charting library (Chart.js / Recharts).
- [ ] Build Analytics Dashboard UI (Top charts, user stats).
- [ ] Build "For You" homepage consuming ML recommendations.

---

### Week 6: The Polish (DevOps, QA, & Documentation)
**Goal:** Make the project evaluate-ready according to 42's strict rules.

**Developer A (Backend):**
- [ ] Finalize all `Dockerfile`s (Go, Python, NGINX, Postgres).
- [ ] Configure NGINX reverse proxy (`/api` $\to$ Go, `/ml` $\to$ Python, `/` $\to$ React).
- [ ] Test single-command launch (`docker compose up --build`).

**Developer B (Frontend):**
- [ ] Run Accessibility (a11y) audits.
- [ ] Fix responsive design issues.
- [ ] Clean up console warnings/errors.

**Dummy 1 & 2 (Joint Effort):**
- [ ] Write the massive `README.md` detailing the 14 points and team roles.
- [ ] Draft mandatory Privacy Policy and Terms of Service.
- [ ] Conduct end-to-end user testing.
