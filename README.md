# Flacky: Music Streaming Platform Roadmap

**Duration:** 1.5 Months (6 Weeks)
**Team Size:** 4 Members (3 Core Developers + 1 Project Management/QA role)
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
| **Developer 1** | **Backend Engine** | Go API, PostgreSQL schemas, WebSockets Hub, Python ML microservice, Docker & DevOps. |
| **Developer 2** | **Frontend UI & Social** | App Routing, CSS Framework (Tailwind), Auth UI, Profile UI, Chat UI, Search UI, Accessibility. |
| **Developer 3** | **Frontend Media & State** | Global State (Redux/Pinia), Howler.js audio engine, S3 Upload logic, WebSocket client, Chart.js logic. |
| **Dummy 1** | **Product Owner / QA** | Documentation (`README.md`), Privacy Policy, Terms of Service, E2E Testing. |

---

## 🚀 6-Week Sprint Protocol

### Week 1: The Foundation (Infrastructure & Schemas)
**Goal:** Both developers can run the app locally, and the database is ready.

**Developer 1 (Backend):**
- [ ] Write `docker-compose.yml` for PostgreSQL, PgAdmin, and Go.
- [ ] Initialize Go project and configure ORM.
- [ ] Design and migrate database schemas (`Users`, `Tracks`, `Playlists`, `Interactions`).
- [ ] Setup base HTTP router (Gin/Fiber).

**Developer 2 (UI & Social):**
- [ ] Initialize React/Vue frontend (Vite).
- [ ] Setup UI component library (Tailwind/MUI) and App Routing.
- [ ] Create Figma wireframes for core views.

**Developer 3 (Media & State):**
- [ ] Setup Global State Management (Redux, Zustand, or Pinia).
- [ ] Setup Axios/Fetch interceptors for API calls.
- [ ] Build the empty shell of the Audio Player pinned to the viewport bottom.

---

### Week 2: Core Hardware (Uploads, Auth, & Streaming)
**Goal:** A user can log in, securely upload an audio file, and stream it back.

**Developer 1 (Backend):**
- [ ] Build standard JWT Auth endpoints (Register/Login).
- [ ] Implement OAuth 2.0 flow.
- [ ] Build AWS S3 Pre-Signed URL generator.
- [ ] Build track metadata `POST` endpoint to save S3 links to PostgreSQL.

**Developer 2 (UI & Social):**
- [ ] Build Auth UI (Login/Register forms).
- [ ] Build the visual layout for the Drag-and-Drop file upload component.

**Developer 3 (Media & State):**
- [ ] Implement the upload logic (requests Pre-Signed URL $\to$ `PUT` to S3).
- [ ] Implement `Howler.js` (or native Audio) to play the S3 stream.
- [ ] Wire up Play/Pause controls and the progress bar to the Audio Player state.

---

### Week 3: The Memory Bank (Profiles, Playlists, & Search)
**Goal:** Users can manage their identity and organize their music.

**Developer 1 (Backend):**
- [ ] Build User Management endpoints (Update avatar, username).
- [ ] Build Playlist CRUD operations.
- [ ] Build Advanced Search endpoint (querying tracks/artists).

**Developer 2 (UI & Social):**
- [ ] Build User Profile and Settings UI.
- [ ] Build Playlist layout and Global Search bar visual components.

**Developer 3 (Media & State):**
- [ ] Connect Profile/Search components to backend APIs.
- [ ] Integrate the audio queue logic (auto-play next song in playlist).

*🚨 **MID-SPRINT SECURITY CHECK:** Ensure audio streams smoothly and DB saves correctly before moving to WebSockets.*

---

### Week 4: The Network (Real-Time Chat & Interactions)
**Goal:** Satisfy the 42 "User Interaction" real-time requirements.

**Developer 1 (Backend):**
- [ ] Set up Go WebSocket Hub.
- [ ] Implement Friends system (Send/Accept requests).
- [ ] Implement real-time direct messaging routing.
- [ ] Broadcast "User Online/Offline" status.

**Developer 2 (UI & Social):**
- [ ] Build Friends List UI with online/offline indicators.
- [ ] Build real-time Chat Window layout and message bubbles.

**Developer 3 (Media & State):**
- [ ] Connect Frontend WebSocket client (Socket.io or native).
- [ ] Wire up the state to send/receive messages dynamically.
- [ ] Listen for and dispatch "Online/Offline" state changes.

---

### Week 5: The Intelligence (Machine Learning & Analytics)
**Goal:** Hit the final major modules for the 14-point threshold.

**Developer 1 (Backend):**
- [ ] Write Go endpoint to aggregate play counts and likes.
- [ ] Initialize Python FastAPI microservice.
- [ ] Write Collaborative Filtering algorithm (`scikit-learn`) reading from Postgres.
- [ ] Expose `/recommendations/{user_id}` endpoint.

**Developer 2 (UI & Social):**
- [ ] Build Analytics Dashboard grid layout.
- [ ] Build "For You" homepage layout.

**Developer 3 (Media & State):**
- [ ] Ensure player fires "Play (>30s)" and "Like" events to the backend DB.
- [ ] Integrate charting library (Chart.js / Recharts) and map backend data to charts.
- [ ] Connect the "For You" page to the Python ML recommendations API.

---

### Week 6: The Polish (DevOps, QA, & Documentation)
**Goal:** Make the project evaluate-ready according to 42's strict rules.

**Developer 1 (Backend):**
- [ ] Finalize all `Dockerfile`s (Go, Python, NGINX, Postgres).
- [ ] Configure NGINX reverse proxy (`/api` $\to$ Go, `/ml` $\to$ Python, `/` $\to$ React).
- [ ] Test single-command launch (`docker compose up --build`).

**Developer 2 (UI & Social):**
- [ ] Run Accessibility (a11y) audits.
- [ ] Fix responsive design issues (mobile/tablet views).

**Developer 3 (Media & State):**
- [ ] Clean up console warnings/errors.
- [ ] Optimize state re-renders (memoization).

**Dummy 1 (PM/QA):**
- [ ] Write the massive `README.md` detailing the 14 points and team roles.
- [ ] Draft mandatory Privacy Policy and Terms of Service.
- [ ] Conduct end-to-end user testing.
