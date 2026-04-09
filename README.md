# Bside: Music Streaming Platform (Rust Architecture)

**Duration:** 6 Weeks
**Team Size:** 4 Members (3 Core Developers + 1 QA/PM)
**Target:** 14 Points

---

## 👥 Team Repartition (Balanced Loadout)

| Member | Role | Responsibilities |
| :--- | :--- | :--- |
| **Developer 1** | **Rust Engine & ML** | Rust API (Axum), WebSocket Hub logic, Python FastAPI (ML Recommender). |
| **Developer 2** | **UI, DB & DevOps** | PostgreSQL schema design (`.sql` migrations), Docker Compose, NGINX proxy, React/Vue visual layouts, CSS (Tailwind). |
| **Developer 3** | **Client Engine** | Global State (Redux/Pinia), Audio streaming (`Howler.js`), API integration, WS Client logic. |
| **Dummy 1** | **PM / QA** | Documentation (`README.md`), Privacy Policy, E2E Testing. |

---

## 🚀 6-Week Sprint Protocol

### Week 1: Foundation & The Contract
**Goal:** The DB is running, and the Rust server answers a basic HTTP ping.

**Developer 1 (Rust Engine):**
- [x] Initialize Cargo workspace (`axum`, `tokio`, `sqlx`).
- [x] Set up the basic HTTP router and CORS.
- [x] Connect Rust to the PostgreSQL port provided by Dev 2.

**Developer 2 (UI, DB, DevOps):**
- [x] Write `docker-compose.yml` (Postgres , Adminer ).
- [x] Write `.sql` migration files (`Users` , `Songs` , `Playlists`).
- [ ] Initialize Frontend framework and setup basic routing. TODO

**Developer 3 (Client Engine):**
- [ ] Setup Global State store. TODO
- [ ] Build the Audio Player component shell (no logic yet). TODO

---

### Week 2: Core Hardware (Uploads, Auth, & Streaming)
**Goal:** Secure audio upload to S3 and playback.

**Developer 1 (Rust Engine):**
- [x] Implement JWT Auth logic in Rust.
- [x] JWT Bouncer 
- [x] Implement OAuth 2.0 flow.
- [x] Implement AWS S3 Pre-Signed URL generation using `aws-sdk-s3`.
- [x] Build `POST /tracks` endpoint using SQLx.

**Developer 2 (UI, DB, DevOps):**
- [ ] Build Auth UI (Login/Register forms).
- [ ] Build the Drag-and-Drop upload visual component.

**Developer 3 (Client Engine):**
- [ ] Write the logic to request the Pre-Signed URL and `PUT` to S3.
- [ ] Implement `Howler.js` to stream the S3 URL.

---

### Week 3: The Memory Bank (Profiles, Playlists, & Search)
**Goal:** Users can manage data and organize music.

**Developer 1 (Rust Engine):**
- [ ] Build Relational POST (artists albums, collabs all interconnected XDXDXDXDXDXD).
- [ ] Best practices to apply according to git.
- [ ] CLI Tool to buld load songs from a directory
- [ ] Build Playlist CRUD operations in Rust.
- [ ] Metadata Aggregation. Playlist response also includes total_duration and song_count.
- [ ] Build Advanced Search endpoint (`ILIKE` queries via SQLx).
- [ ] Look if there is anything else to do related to the AI week 5.

**Developer 2 (UI, DB, DevOps):**
- [ ] Build User Profile and Settings UI.
- [ ] Build Playlist layout and Search bar UI.

**Developer 3 (Client Engine):**
- [ ] Connect Profile/Search components to Rust APIs.
- [ ] Implement the audio queue logic (auto-play next song).

---

### Week 4: The Network (Real-Time Chat & Interactions)
**Goal:** Satisfy the 42 User Interaction requirements using Rust WebSockets.

**Developer 1 (Rust Engine):**
- [ ] Set up WebSocket route in Axum (`axum::extract::ws`).
- [ ] Build an async state manager (e.g., `Arc<Mutex<HashMap>>`) to track connected users.
- [ ] Route live messages and broadcast Online/Offline status.

**Developer 2 (UI, DB, DevOps):**
- [ ] Build Friends List UI and Chat Window layout.
- [ ] Update DB schema if necessary for Chat Histories.

**Developer 3 (Client Engine):**
- [ ] Connect Frontend WebSocket client.
- [ ] Wire up state to send/receive messages dynamically.

---

### Week 5: The Intelligence (Python ML & Analytics)
**Goal:** Hit the AI requirement (2 points).

**Developer 1 (Rust Engine):**
- [ ] Temporarily pivot to Python: Initialize FastAPI.
- [ ] Write Collaborative Filtering algorithm (`scikit-learn`) reading from Postgres.
- [ ] Ensure Rust API tracks "Play (>30s)" events via SQLx.

**Developer 2 (UI, DB, DevOps):**
- [ ] Write `Dockerfile`s for the React app, Rust backend, and Python service.
- [ ] Build Analytics Dashboard grid layout.

**Developer 3 (Client Engine):**
- [ ] Integrate charting library (Chart.js) with backend analytics endpoints.
- [ ] Connect the "For You" page to the Python ML API.

---

### Week 6: The Polish & Deployment
**Goal:** Evaluate-ready according to 42 rules.

**Developer 1 (Rust Engine):**
- [ ] Hunt down any `.unwrap()` panics in Rust and handle errors gracefully.
- [ ] Test WebSocket load limits.

**Developer 2 (UI, DB, DevOps):**
- [ ] Configure NGINX reverse proxy (`/api` $\to$ Rust, `/ml` $\to$ Python, `/` $\to$ React).
- [ ] Test the full `docker compose up --build` pipeline.
- [ ] Run Accessibility audits on the UI.

**Developer 3 (Client Engine):**
- [ ] Clean up console warnings and optimize React/Vue re-renders.

**Dummy 1:**
- [ ] Finalize `README.md`, Privacy Policy, and E2E Testing.

**Nice to have**:
- Playlist also show amount of songs in them, + total time of listening.
- Playlists also have ml features ? :D
