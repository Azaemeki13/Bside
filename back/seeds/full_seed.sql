\set ON_ERROR_STOP on
\echo 'Loading deterministic B-Side development data...'

BEGIN;
SET LOCAL TIME ZONE 'UTC';

-- Development-only reset. The SQLx migration history is intentionally preserved.
TRUNCATE TABLE
    user_preferences,
    user_song_interactions,
    messages,
    friendships,
    artist_requests,
    song_collaborators,
    playlist_songs,
    playlists,
    songs,
    albums,
    artists,
    local_credentials,
    contacts,
    users
RESTART IDENTITY CASCADE;

-- =========================================================
-- Users
-- Password for every seeded account: Password123!
-- =========================================================
INSERT INTO users (
    id, email, username, display_name, role, avatar_url, is_banned, created_at
)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'luna.rivera@bside.local', 'luna', 'Luna Rivera', 'Artist', NULL, FALSE, '2026-07-01 08:00:00+00'),
    ('22222222-2222-4222-8222-222222222222', 'alex.martin@bside.local', 'alex', 'Alex Martin', 'User', NULL, FALSE, '2026-07-01 08:05:00+00'),
    ('33333333-3333-4333-8333-333333333333', 'maya.chen@bside.local', 'maya', 'Maya Chen', 'User', NULL, FALSE, '2026-07-01 08:10:00+00'),
    ('44444444-4444-4444-8444-444444444444', 'noah.bernard@bside.local', 'noah', 'Noah Bernard', 'Artist', NULL, FALSE, '2026-07-01 08:15:00+00'),
    ('55555555-5555-4555-8555-555555555555', 'ethan.cole@bside.local', 'ethan', 'Ethan Cole', 'User', NULL, FALSE, '2026-07-01 08:20:00+00'),
    ('66666666-6666-4666-8666-666666666666', 'admin@bside.local', 'admin', 'B-Side Admin', 'Admin', NULL, FALSE, '2026-07-01 08:25:00+00'),
    ('77777777-7777-4777-8777-777777777777', 'moderator@bside.local', 'moderator', 'B-Side Moderator', 'Moderator', NULL, FALSE, '2026-07-01 08:30:00+00');

INSERT INTO local_credentials (user_id, password_hash, updated_at)
VALUES
    ('11111111-1111-4111-8111-111111111111', '$argon2id$v=19$m=65536,t=3,p=4$33/7ja3/RkOyZ2txgRiKAA$e4O6VrVboflB6TM9C/bNskyNvt9A18eUl33ezgmIHN8', '2026-07-01 08:00:00+00'),
    ('22222222-2222-4222-8222-222222222222', '$argon2id$v=19$m=65536,t=3,p=4$MooTKtRUSQhd98UPqtQGsQ$+UYS6/HmJtPsIJOFVEaVgDD4gwWdhgft5gpXedtLk3E', '2026-07-01 08:05:00+00'),
    ('33333333-3333-4333-8333-333333333333', '$argon2id$v=19$m=65536,t=3,p=4$H1PcaGTTQKfC7XvMHINUWQ$fKSUy8PLigbrFL4PDhfvcwNW0jyWqPRGBuscLkkyNlU', '2026-07-01 08:10:00+00'),
    ('44444444-4444-4444-8444-444444444444', '$argon2id$v=19$m=65536,t=3,p=4$D/HnmTWAV6nhrGRplmJmhQ$ehFMB/wzxUaXp7EMCZdPFGYuwILQGV+D+S/dGLgDCNI', '2026-07-01 08:15:00+00'),
    ('55555555-5555-4555-8555-555555555555', '$argon2id$v=19$m=65536,t=3,p=4$33/7ja3/RkOyZ2txgRiKAA$e4O6VrVboflB6TM9C/bNskyNvt9A18eUl33ezgmIHN8', '2026-07-01 08:20:00+00'),
    ('66666666-6666-4666-8666-666666666666', '$argon2id$v=19$m=65536,t=3,p=4$33/7ja3/RkOyZ2txgRiKAA$e4O6VrVboflB6TM9C/bNskyNvt9A18eUl33ezgmIHN8', '2026-07-01 08:25:00+00'),
    ('77777777-7777-4777-8777-777777777777', '$argon2id$v=19$m=65536,t=3,p=4$MooTKtRUSQhd98UPqtQGsQ$+UYS6/HmJtPsIJOFVEaVgDD4gwWdhgft5gpXedtLk3E', '2026-07-01 08:30:00+00');

-- =========================================================
-- Contacts
-- =========================================================
INSERT INTO contacts (name, email, message, created_at)
VALUES
    ('Demo Visitor', 'visitor@example.local', 'I would like more information about B-Side.', '2026-07-02 09:00:00'),
    ('Indie Label', 'label@example.local', 'We would like to discuss an artist partnership.', '2026-07-03 14:30:00');

-- =========================================================
-- Artists, albums and songs
-- Every normalized vector uses the same 3-dimensional space.
-- =========================================================
INSERT INTO artists (id, user_id, name, bio, photo_url, status, created_at)
VALUES
    ('81000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Luna Rivera', 'Independent electronic artist.', 'http://localhost:9000/bside-covers/luna.jpg', 'Ready', '2026-07-04 10:00:00+00'),
    ('81000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'Noah Bernard', 'Ambient producer and guitarist.', 'http://localhost:9000/bside-covers/noah.jpg', 'Ready', '2026-07-04 10:10:00+00'),
    ('90000000-0000-4000-8000-000000000001', NULL, 'WebSocket Test Artist', 'Artist used for WebSocket song-sharing tests.', 'http://localhost:9000/bside-covers/default_artist.jpg', 'Ready', '2026-07-04 10:20:00+00'),
    ('91000000-0000-4000-8000-000000000001', NULL, 'Preference Test Artist', 'Artist used for preference-vector tests.', 'http://localhost:9000/bside-covers/default_artist.jpg', 'Ready', '2026-07-04 10:30:00+00');

INSERT INTO albums (id, artist_id, title, genre, cover_url, status, created_at)
VALUES
    ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'Midnight Signals', 'Electronic', 'http://localhost:9000/bside-covers/midnight-signals.jpg', 'Ready', '2026-07-05 10:00:00+00'),
    ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'Blue Static', 'Ambient', 'http://localhost:9000/bside-covers/blue-static.jpg', 'Ready', '2026-07-05 10:10:00+00'),
    ('90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'WebSocket Test Album', 'Test', 'http://localhost:9000/bside-covers/default_cover.jpg', 'Ready', '2026-07-05 10:20:00+00'),
    ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Preference Test Album', 'Test', 'http://localhost:9000/bside-covers/default_album.jpg', 'Ready', '2026-07-05 10:30:00+00');

INSERT INTO songs (
    id, album_id, title, duration_seconds, audio_url, ml_features, status, normalized_vector, created_at
)
VALUES
    ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Midnight Drive', 210, 'audio/midnight-drive.mp3', '{"tempo":118,"energy":0.82}'::jsonb, 'Ready', ARRAY[0.70710677::real, 0.70710677::real, 0.0::real], '2026-07-06 10:00:00+00'),
    ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'Quiet Orbit', 195, 'audio/quiet-orbit.mp3', '{"tempo":92,"energy":0.45}'::jsonb, 'Ready', ARRAY[0.57735026::real, 0.57735026::real, 0.57735026::real], '2026-07-06 10:05:00+00'),
    ('83000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000002', 'Blue Echo', 205, 'audio/blue-echo.mp3', '{"tempo":84,"energy":0.38}'::jsonb, 'Ready', ARRAY[0.0::real, 0.70710677::real, 0.70710677::real], '2026-07-06 10:10:00+00'),
    ('90000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', 'WebSocket Test Song', 180, 'test/websocket-test-song.wav', '{}'::jsonb, 'Ready', ARRAY[0.70710677::real, 0.0::real, 0.70710677::real], '2026-07-06 10:15:00+00'),
    ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'Preference Test Song A', 180, 'test/preference-song-a.mp3', '{}'::jsonb, 'Ready', ARRAY[1.0::real, 0.0::real, 0.0::real], '2026-07-06 10:20:00+00'),
    ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'Preference Test Song B', 180, 'test/preference-song-b.mp3', '{}'::jsonb, 'Ready', ARRAY[0.0::real, 1.0::real, 0.0::real], '2026-07-06 10:25:00+00'),
    ('93000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', 'Preference Test Song C', 180, 'test/preference-song-c.mp3', '{}'::jsonb, 'Ready', ARRAY[0.0::real, 0.0::real, 1.0::real], '2026-07-06 10:30:00+00');

INSERT INTO song_collaborators (song_id, artist_id, role)
VALUES
    ('83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', 'Featured'),
    ('83000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001', 'Producer');

-- =========================================================
-- Playlists and liked songs
-- The exact title "Liked Songs" is used by the preference backend.
-- =========================================================
INSERT INTO playlists (
    id, owner_id, title, description, cover_url, is_public,
    created_at, total_duration, song_count, ml_features
)
VALUES
    ('84000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Liked Songs', 'Luna''s liked songs.', NULL, FALSE, '2026-07-07 09:00:00+00', 180, 1, '{}'::jsonb),
    ('84000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Liked Songs', 'Alex''s liked songs.', NULL, FALSE, '2026-07-07 09:05:00+00', 180, 1, '{}'::jsonb),
    ('84000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'Liked Songs', 'Maya''s liked songs.', NULL, FALSE, '2026-07-07 09:10:00+00', 180, 1, '{}'::jsonb),
    ('84000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', 'Liked Songs', 'Noah''s liked songs.', NULL, FALSE, '2026-07-07 09:15:00+00', 205, 1, '{}'::jsonb),
    ('84000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555', 'Liked Songs', 'Ethan''s liked songs.', NULL, FALSE, '2026-07-07 09:20:00+00', 0, 0, '{}'::jsonb),
    ('84000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Night Coding', 'Electronic and ambient tracks for coding.', 'http://localhost:9000/bside-covers/night-coding.jpg', TRUE, '2026-07-07 09:25:00+00', 570, 3, '{}'::jsonb);

INSERT INTO playlist_songs (id, playlist_id, song_id, position, added_at)
VALUES
    ('85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 0, '2026-07-08 10:00:00+00'),
    ('85000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000003', 0, '2026-07-08 10:05:00+00'),
    ('85000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000002', 0, '2026-07-08 10:10:00+00'),
    ('85000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000003', 0, '2026-07-08 10:15:00+00'),
    ('85000000-0000-4000-8000-000000000005', '84000000-0000-4000-8000-000000000006', '83000000-0000-4000-8000-000000000001', 0, '2026-07-08 10:20:00+00'),
    ('85000000-0000-4000-8000-000000000006', '84000000-0000-4000-8000-000000000006', '93000000-0000-4000-8000-000000000002', 1, '2026-07-08 10:21:00+00'),
    ('85000000-0000-4000-8000-000000000007', '84000000-0000-4000-8000-000000000006', '93000000-0000-4000-8000-000000000003', 2, '2026-07-08 10:22:00+00');

-- =========================================================
-- Artist requests
-- =========================================================
INSERT INTO artist_requests (
    id, user_id, artist_name, bio, status, reviewed_by, reviewed_at, created_at
)
VALUES
    ('86000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'Maya Waves', 'Bedroom pop project.', 'Pending', NULL, NULL, '2026-07-09 09:00:00+00'),
    ('86000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'Noah Bernard', 'Ambient producer and guitarist.', 'Accepted', '66666666-6666-4666-8666-666666666666', '2026-07-10 11:00:00+00', '2026-07-09 09:10:00+00'),
    ('86000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555', 'Ethan Beats', 'First artist application.', 'Denied', '77777777-7777-4777-8777-777777777777', '2026-07-10 11:30:00+00', '2026-07-09 09:20:00+00');

-- =========================================================
-- Friendships
-- =========================================================
INSERT INTO friendships (
    id, requester_id, addressee_id, status, created_at, updated_at
)
VALUES
    ('87000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'accepted', '2026-07-11 09:00:00+00', '2026-07-11 09:10:00+00'),
    ('87000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'accepted', '2026-07-11 09:20:00+00', '2026-07-11 09:30:00+00'),
    ('87000000-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'pending', '2026-07-11 09:40:00+00', '2026-07-11 09:40:00+00'),
    ('87000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'pending', '2026-07-11 09:50:00+00', '2026-07-11 09:50:00+00'),
    ('87000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', 'rejected', '2026-07-11 10:00:00+00', '2026-07-11 10:10:00+00');

-- =========================================================
-- Messages: text and shared-song messages, with all statuses.
-- =========================================================
INSERT INTO messages (
    id, sender_id, receiver_id, content, status,
    message_type, song_id, created_at, delivered_at, read_at
)
VALUES
    ('88000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Hi Luna, I really liked your latest track.', 'read', 'text', NULL, '2026-07-12 10:00:00+00', '2026-07-12 10:00:05+00', '2026-07-12 10:05:00+00'),
    ('88000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Thanks! Here is another track.', 'delivered', 'song', '83000000-0000-4000-8000-000000000001', '2026-07-12 10:06:00+00', '2026-07-12 10:06:05+00', NULL),
    ('88000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Can I add your song to my playlist?', 'read', 'text', NULL, '2026-07-12 11:00:00+00', '2026-07-12 11:00:05+00', '2026-07-12 11:02:00+00'),
    ('88000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Here is the song I mentioned.', 'sent', 'song', '83000000-0000-4000-8000-000000000003', '2026-07-12 12:00:00+00', NULL, NULL),
    ('88000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'I will answer your friend request later.', 'delivered', 'text', NULL, '2026-07-12 13:00:00+00', '2026-07-12 13:00:10+00', NULL);

-- =========================================================
-- User interactions
-- =========================================================
INSERT INTO user_song_interactions (
    id, user_id, song_id, interaction_type,
    listened_seconds, song_duration_seconds, created_at
)
VALUES
    ('89000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '93000000-0000-4000-8000-000000000001', 'like', NULL, 180, '2026-07-13 09:00:00+00'),
    ('89000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '93000000-0000-4000-8000-000000000002', 'complete', 180, 180, '2026-07-13 09:10:00+00'),
    ('89000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '93000000-0000-4000-8000-000000000003', 'skip', 10, 180, '2026-07-13 09:20:00+00'),
    ('89000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', '90000000-0000-4000-8000-000000000003', 'like', NULL, 180, '2026-07-13 10:00:00+00'),
    ('89000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', '90000000-0000-4000-8000-000000000003', 'complete', 180, 180, '2026-07-13 10:10:00+00'),
    ('89000000-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333', '93000000-0000-4000-8000-000000000002', 'like', NULL, 180, '2026-07-13 11:00:00+00'),
    ('89000000-0000-4000-8000-000000000007', '33333333-3333-4333-8333-333333333333', '93000000-0000-4000-8000-000000000002', 'replay', 180, 180, '2026-07-13 11:10:00+00'),
    ('89000000-0000-4000-8000-000000000008', '33333333-3333-4333-8333-333333333333', '83000000-0000-4000-8000-000000000001', 'play', 60, 210, '2026-07-13 11:20:00+00'),
    ('89000000-0000-4000-8000-000000000009', '44444444-4444-4444-8444-444444444444', '83000000-0000-4000-8000-000000000003', 'like', NULL, 205, '2026-07-13 12:00:00+00'),
    ('89000000-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', '83000000-0000-4000-8000-000000000003', 'complete', 205, 205, '2026-07-13 12:10:00+00'),
    ('89000000-0000-4000-8000-00000000000b', '55555555-5555-4555-8555-555555555555', '93000000-0000-4000-8000-000000000003', 'like', NULL, 180, '2026-07-13 13:00:00+00'),
    ('89000000-0000-4000-8000-00000000000c', '55555555-5555-4555-8555-555555555555', '93000000-0000-4000-8000-000000000003', 'unlike', NULL, 180, '2026-07-13 13:05:00+00'),
    ('89000000-0000-4000-8000-00000000000d', '55555555-5555-4555-8555-555555555555', '83000000-0000-4000-8000-000000000002', 'play', 45, 195, '2026-07-13 13:10:00+00');

-- =========================================================
-- Precomputed preference vectors matching the seeded state.
-- Weights: Like +3, Replay +2, Complete +1.5, Play +0.5, Skip -1.
-- =========================================================
INSERT INTO user_preferences (user_id, preference_vector, updated_at)
VALUES
    ('11111111-1111-4111-8111-111111111111', ARRAY[0.85714287::real, 0.42857143::real, -0.28571430::real], '2026-07-13 14:00:00+00'),
    ('22222222-2222-4222-8222-222222222222', ARRAY[0.70710677::real, 0.0::real, 0.70710677::real], '2026-07-13 14:05:00+00'),
    ('33333333-3333-4333-8333-333333333333', ARRAY[0.06589734::real, 0.99782640::real, 0.0::real], '2026-07-13 14:10:00+00'),
    ('44444444-4444-4444-8444-444444444444', ARRAY[0.0::real, 0.70710677::real, 0.70710677::real], '2026-07-13 14:15:00+00'),
    ('55555555-5555-4555-8555-555555555555', ARRAY[0.57735026::real, 0.57735026::real, 0.57735026::real], '2026-07-13 14:20:00+00');

COMMIT;

\echo 'B-Side development data loaded successfully.'
\echo 'All seeded accounts use password: Password123!'

SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'local_credentials', COUNT(*) FROM local_credentials
UNION ALL SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL SELECT 'artists', COUNT(*) FROM artists
UNION ALL SELECT 'albums', COUNT(*) FROM albums
UNION ALL SELECT 'songs', COUNT(*) FROM songs
UNION ALL SELECT 'song_collaborators', COUNT(*) FROM song_collaborators
UNION ALL SELECT 'playlists', COUNT(*) FROM playlists
UNION ALL SELECT 'playlist_songs', COUNT(*) FROM playlist_songs
UNION ALL SELECT 'artist_requests', COUNT(*) FROM artist_requests
UNION ALL SELECT 'friendships', COUNT(*) FROM friendships
UNION ALL SELECT 'messages', COUNT(*) FROM messages
UNION ALL SELECT 'user_song_interactions', COUNT(*) FROM user_song_interactions
UNION ALL SELECT 'user_preferences', COUNT(*) FROM user_preferences
ORDER BY table_name;
