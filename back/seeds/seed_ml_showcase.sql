\set ON_ERROR_STOP on
\echo 'Loading B-Side ML showcase users/interactions (249-track catalogue)...'
\echo 'Prerequisite: upload scripts/songs first and wait until ML marks every track Ready.'

BEGIN;
SET LOCAL TIME ZONE 'UTC';

-- -----------------------------------------------------------------------------
-- 0. Recommendation compatibility guard
-- -----------------------------------------------------------------------------
-- The ML callback stores exactly 6 normalized values. Any Ready song with a
-- different cardinality (legacy 3D dev seed data) would make cosine similarity
-- return 0 against the 6D user preferences and pollute Daily Mix.
UPDATE songs
SET status = 'Failed'
WHERE status::text = 'Ready'
  AND normalized_vector IS NOT NULL
  AND cardinality(normalized_vector) <> 6;

-- -----------------------------------------------------------------------------
-- 1. Artist / album song pools
-- -----------------------------------------------------------------------------
-- Each persona's taste is expressed as "the first N tracks of a pool" rather
-- than by naming individual songs, so the seed stays readable and survives
-- small title differences in the imported catalogue.
CREATE TEMP TABLE showcase_pools (
    pool_key   TEXT PRIMARY KEY,
    artist_like TEXT NOT NULL,
    album_like  TEXT NOT NULL DEFAULT '%',
    take_n      INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO showcase_pools (pool_key, artist_like, album_like, take_n) VALUES
    ('cdw',      'Charlotte de Witte',      '%', 1),  -- catalogue only has one CdW track
    ('dp_alive', 'Daft Punk',               'Alive%', 8),
    ('dp_disco', 'Daft Punk',               'Discovery%', 8),
    ('dp_ram',   'Daft Punk',               'Random Access%', 8),
    ('guetta',   'David Guetta',            '%', 8),
    ('acdc',     'ACDC',                    '%', 8),
    ('rhcp',     'Red Hot Chilli Peppers',  '%', 8),
    ('arctic',   'Artic Monkeys',           '%', 8),
    ('djo',      'Djo',                     '%', 8),
    ('chopin',   'Chopin',                  '%', 8),
    ('einaudi',  'Ludovico Einaudi',        '%', 8),
    ('zimmer',   'Hans Zimmer',             '%', 8),
    ('swift',    'Taylor Swift',            '%', 8);

-- Resolve every pool to concrete songs, numbered 1..take_n by title.
CREATE TEMP TABLE showcase_pool_songs ON COMMIT DROP AS
SELECT pool_key, pool_rank, song_id, title, duration_seconds
FROM (
    SELECT
        pool.pool_key,
        song.id AS song_id,
        song.title,
        song.duration_seconds,
        ROW_NUMBER() OVER (
            PARTITION BY pool.pool_key
            ORDER BY album.title, song.title
        ) AS pool_rank
    FROM showcase_pools pool
    JOIN artists artist ON artist.name ILIKE pool.artist_like
    JOIN albums  album  ON album.artist_id = artist.id AND album.title ILIKE pool.album_like
    JOIN songs   song   ON song.album_id = album.id
    WHERE song.status::text = 'Ready'
      AND album.status = 'Ready'
      AND song.normalized_vector IS NOT NULL
      AND cardinality(song.normalized_vector) = 6
) ranked
JOIN showcase_pools USING (pool_key)
WHERE ranked.pool_rank <= showcase_pools.take_n;

DO $$
DECLARE
    thin_pools TEXT;
BEGIN
    SELECT string_agg(pool.pool_key || ' (' || COALESCE(got.n, 0) || '/' || pool.take_n || ')', ', ')
      INTO thin_pools
    FROM showcase_pools pool
    LEFT JOIN (
        SELECT pool_key, COUNT(*) AS n FROM showcase_pool_songs GROUP BY pool_key
    ) got USING (pool_key)
    WHERE COALESCE(got.n, 0) < LEAST(pool.take_n, 2);

    IF thin_pools IS NOT NULL THEN
        RAISE EXCEPTION
            'ML showcase song pools are underpopulated: %. Upload scripts/songs and wait for ML before rerunning.',
            thin_pools;
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. Deterministic demo users
-- -----------------------------------------------------------------------------
DELETE FROM users
WHERE email LIKE 'showcase%@bside.local';

CREATE TEMP TABLE showcase_personas (
    user_no INTEGER PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    persona_title TEXT NOT NULL,
    persona_description TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO showcase_personas
    (user_no, user_id, email, username, display_name, persona_title, persona_description)
VALUES
    ( 1, 'a1000000-0000-4000-8000-000000000001', 'showcase01@bside.local', 'showcase_techno',       'Ava Techno',      'Techno Purist',      'Peak-time techno and live Daft Punk.'),
    ( 2, 'a1000000-0000-4000-8000-000000000002', 'showcase02@bside.local', 'showcase_house',        'Ben House',       'French House',       'Filtered house and disco-robot Daft Punk.'),
    ( 3, 'a1000000-0000-4000-8000-000000000003', 'showcase03@bside.local', 'showcase_edm_pop',      'Clara EDM',       'EDM Pop',            'Big-room EDM with pop vocal hooks.'),
    ( 4, 'a1000000-0000-4000-8000-000000000004', 'showcase04@bside.local', 'showcase_hard_rock',    'Dylan Rock',      'Hard Rock',          'Stadium hard rock, guitars first.'),
    ( 5, 'a1000000-0000-4000-8000-000000000005', 'showcase05@bside.local', 'showcase_funk_rock',    'Emma Funk',       'Funk Rock',          'Slap-bass funk rock.'),
    ( 6, 'a1000000-0000-4000-8000-000000000006', 'showcase06@bside.local', 'showcase_indie_rock',   'Finn Indie',      'Indie Rock',         'Modern indie / alt rock.'),
    ( 7, 'a1000000-0000-4000-8000-000000000007', 'showcase07@bside.local', 'showcase_psych_pop',    'Grace Psych',     'Psych Pop',          'Psychedelic bedroom pop.'),
    ( 8, 'a1000000-0000-4000-8000-000000000008', 'showcase08@bside.local', 'showcase_classical',    'Hugo Classical',  'Classical Piano',    'Solo piano, Chopin above all.'),
    ( 9, 'a1000000-0000-4000-8000-000000000009', 'showcase09@bside.local', 'showcase_neoclassical', 'Iris Neo',        'Neoclassical',       'Contemporary minimalist piano.'),
    (10, 'a1000000-0000-4000-8000-000000000010', 'showcase10@bside.local', 'showcase_cinematic',    'Jack Score',      'Cinematic',          'Film-score ambience and drones.'),
    (11, 'a1000000-0000-4000-8000-000000000011', 'showcase11@bside.local', 'showcase_pop',          'Kim Pop',         'Mainstream Pop',     'Radio pop, big choruses.'),
    (12, 'a1000000-0000-4000-8000-000000000012', 'showcase12@bside.local', 'showcase_rock_mix',     'Leo Rock',        'Rock Omnivore',      'Anything with loud guitars.'),
    (13, 'a1000000-0000-4000-8000-000000000013', 'showcase13@bside.local', 'showcase_electronic',   'Mia Electro',     'Electronic Omnivore','House, techno and EDM, no snobbery.'),
    (14, 'a1000000-0000-4000-8000-000000000014', 'showcase14@bside.local', 'showcase_chill',        'Nolan Chill',     'Chill / Focus',      'Piano and score for studying.'),
    (15, 'a1000000-0000-4000-8000-000000000015', 'showcase15@bside.local', 'showcase_cold_start',   'Olivia New',      'Cold Start',         'No listening history: catalog fallback.');

INSERT INTO users (id, email, username, display_name, role, avatar_url, is_banned, created_at)
SELECT user_id, email, username, display_name, 'User', NULL, FALSE,
       NOW() - INTERVAL '30 days' + (user_no * INTERVAL '5 minutes')
FROM showcase_personas;

-- Password for every showcase account: Password123!
INSERT INTO local_credentials (user_id, password_hash, updated_at)
SELECT user_id,
       '$argon2id$v=19$m=65536,t=3,p=4$33/7ja3/RkOyZ2txgRiKAA$e4O6VrVboflB6TM9C/bNskyNvt9A18eUl33ezgmIHN8',
       NOW()
FROM showcase_personas;

-- -----------------------------------------------------------------------------
-- 3. Liked Songs + visible persona playlists
-- -----------------------------------------------------------------------------
INSERT INTO playlists (id, owner_id, title, description, cover_url, is_public,
                       created_at, total_duration, song_count, ml_features)
SELECT gen_random_uuid(), user_id, 'Liked Songs',
       'ML showcase liked songs for ' || display_name || '.',
       NULL, FALSE, NOW() - INTERVAL '14 days', 0, 0, '{}'::jsonb
FROM showcase_personas;

INSERT INTO playlists (id, owner_id, title, description, cover_url, is_public,
                       created_at, total_duration, song_count, ml_features)
SELECT gen_random_uuid(), user_id, 'Showcase - ' || persona_title,
       persona_description, NULL, TRUE, NOW() - INTERVAL '10 days', 0, 0, '{}'::jsonb
FROM showcase_personas;

-- -----------------------------------------------------------------------------
-- 4. Taste matrix: likes, playback, skips - all expressed against pools
-- -----------------------------------------------------------------------------
-- like_to_rank: user "likes" showcase_pool_songs rows with pool_rank <= value.
CREATE TEMP TABLE showcase_likes (
    user_no INTEGER NOT NULL,
    pool_key TEXT NOT NULL,
    like_to_rank INTEGER NOT NULL,
    PRIMARY KEY (user_no, pool_key)
) ON COMMIT DROP;

INSERT INTO showcase_likes (user_no, pool_key, like_to_rank) VALUES
    ( 1,'cdw',2),( 1,'dp_alive',3),( 1,'guetta',2),
    ( 2,'dp_disco',3),( 2,'dp_ram',3),
    ( 3,'guetta',3),( 3,'dp_ram',2),( 3,'swift',1),
    ( 4,'acdc',3),( 4,'rhcp',2),
    ( 5,'rhcp',3),( 5,'acdc',2),
    ( 6,'arctic',3),( 6,'djo',2),
    ( 7,'djo',3),( 7,'arctic',2),
    ( 8,'chopin',3),( 8,'einaudi',2),
    ( 9,'einaudi',3),( 9,'chopin',2),( 9,'zimmer',1),
    (10,'zimmer',3),(10,'einaudi',2),
    (11,'swift',3),(11,'djo',2),
    (12,'acdc',2),(12,'rhcp',2),(12,'arctic',2),
    (13,'dp_disco',2),(13,'cdw',1),(13,'guetta',2),(13,'dp_alive',1),
    (14,'einaudi',2),(14,'chopin',2),(14,'zimmer',2);

-- Playback: positive listens on the "own lane" pool, one skip on a rival pool.
CREATE TEMP TABLE showcase_playback (
    user_no INTEGER NOT NULL,
    pool_key TEXT NOT NULL,
    interaction_type VARCHAR(30) NOT NULL,
    play_to_rank INTEGER NOT NULL,
    days_ago INTEGER NOT NULL,
    PRIMARY KEY (user_no, pool_key, interaction_type)
) ON COMMIT DROP;

INSERT INTO showcase_playback (user_no, pool_key, interaction_type, play_to_rank, days_ago) VALUES
    ( 1,'dp_alive','replay',3,6),( 1,'dp_alive','complete',3,4),( 1,'chopin','skip',2,2),
    ( 2,'dp_disco','replay',3,6),( 2,'dp_ram','complete',3,4),( 2,'acdc','skip',2,2),
    ( 3,'guetta','replay',3,6),( 3,'dp_ram','complete',2,4),( 3,'chopin','skip',2,2),
    ( 4,'acdc','replay',3,6),( 4,'rhcp','complete',2,4),( 4,'chopin','skip',2,2),
    ( 5,'rhcp','replay',3,6),( 5,'acdc','complete',2,4),( 5,'einaudi','skip',2,2),
    ( 6,'arctic','replay',3,6),( 6,'djo','complete',2,4),( 6,'zimmer','skip',2,2),
    ( 7,'djo','replay',3,6),( 7,'arctic','complete',2,4),( 7,'acdc','skip',2,2),
    ( 8,'chopin','replay',3,6),( 8,'einaudi','complete',2,4),( 8,'acdc','skip',2,2),
    ( 9,'einaudi','replay',3,6),( 9,'chopin','complete',2,4),( 9,'guetta','skip',2,2),
    (10,'zimmer','replay',3,6),(10,'einaudi','complete',2,4),(10,'guetta','skip',2,2),
    (11,'swift','replay',3,6),(11,'djo','complete',2,4),(11,'acdc','skip',2,2),
    (12,'rhcp','replay',3,6),(12,'acdc','complete',2,4),(12,'chopin','skip',2,2),
    (13,'guetta','replay',3,6),(13,'dp_disco','complete',2,4),(13,'einaudi','skip',2,2),
    (14,'chopin','replay',3,6),(14,'zimmer','complete',2,4),(14,'acdc','skip',2,2);

-- Liked Songs playlist (drives LIKE_WEIGHT +3.0 in preferences.rs).
INSERT INTO playlist_songs (id, playlist_id, song_id, position, added_at)
SELECT gen_random_uuid(), playlist.id, pool_song.song_id,
       ROW_NUMBER() OVER (PARTITION BY persona.user_id ORDER BY likes.pool_key, pool_song.pool_rank),
       NOW() - INTERVAL '9 days'
FROM showcase_likes likes
JOIN showcase_personas persona USING (user_no)
JOIN showcase_pool_songs pool_song
  ON pool_song.pool_key = likes.pool_key AND pool_song.pool_rank <= likes.like_to_rank
JOIN playlists playlist
  ON playlist.owner_id = persona.user_id AND playlist.title = 'Liked Songs';

-- Mirror the same songs into the public persona playlist (UI visibility only).
INSERT INTO playlist_songs (id, playlist_id, song_id, position, added_at)
SELECT gen_random_uuid(), playlist.id, pool_song.song_id,
       ROW_NUMBER() OVER (PARTITION BY persona.user_id ORDER BY likes.pool_key, pool_song.pool_rank),
       NOW() - INTERVAL '8 days'
FROM showcase_likes likes
JOIN showcase_personas persona USING (user_no)
JOIN showcase_pool_songs pool_song
  ON pool_song.pool_key = likes.pool_key AND pool_song.pool_rank <= likes.like_to_rank
JOIN playlists playlist
  ON playlist.owner_id = persona.user_id AND playlist.title = 'Showcase - ' || persona.persona_title;

UPDATE playlists playlist
SET song_count = stats.song_count, total_duration = stats.total_duration
FROM (
    SELECT ps.playlist_id, COUNT(*)::INTEGER AS song_count,
           COALESCE(SUM(song.duration_seconds), 0)::INTEGER AS total_duration
    FROM playlist_songs ps JOIN songs song ON song.id = ps.song_id
    GROUP BY ps.playlist_id
) stats
WHERE playlist.id = stats.playlist_id
  AND playlist.owner_id IN (SELECT user_id FROM showcase_personas);

-- 'like' history rows (analytics/history; weight itself comes from the playlist).
INSERT INTO user_song_interactions
    (id, user_id, song_id, interaction_type, listened_seconds, song_duration_seconds, created_at)
SELECT gen_random_uuid(), persona.user_id, pool_song.song_id, 'like', NULL, NULL,
       NOW() - INTERVAL '9 days' + (pool_song.pool_rank * INTERVAL '3 minutes')
FROM showcase_likes likes
JOIN showcase_personas persona USING (user_no)
JOIN showcase_pool_songs pool_song
  ON pool_song.pool_key = likes.pool_key AND pool_song.pool_rank <= likes.like_to_rank;

-- play / complete / replay / skip history.
INSERT INTO user_song_interactions
    (id, user_id, song_id, interaction_type, listened_seconds, song_duration_seconds, created_at)
SELECT gen_random_uuid(), persona.user_id, pool_song.song_id, playback.interaction_type,
       CASE playback.interaction_type
           WHEN 'complete' THEN pool_song.duration_seconds
           WHEN 'replay'   THEN pool_song.duration_seconds
           WHEN 'play'     THEN GREATEST(1, ROUND(pool_song.duration_seconds * 0.65)::INTEGER)
           WHEN 'skip'     THEN GREATEST(5, ROUND(pool_song.duration_seconds * 0.20)::INTEGER)
           ELSE NULL
       END,
       pool_song.duration_seconds,
       NOW() - (playback.days_ago * INTERVAL '1 day') + (pool_song.pool_rank * INTERVAL '7 minutes')
FROM showcase_playback playback
JOIN showcase_personas persona USING (user_no)
JOIN showcase_pool_songs pool_song
  ON pool_song.pool_key = playback.pool_key AND pool_song.pool_rank <= playback.play_to_rank;

-- -----------------------------------------------------------------------------
-- 5. Rebuild preference vectors with the same weights as src/preferences.rs
-- -----------------------------------------------------------------------------
DELETE FROM user_preferences
WHERE user_id IN (SELECT user_id FROM showcase_personas);

WITH playback_weights AS (
    SELECT interaction.user_id, interaction.song_id,
        SUM(CASE interaction.interaction_type
                WHEN 'replay'   THEN  2.0
                WHEN 'complete' THEN  1.5
                WHEN 'play'     THEN  0.5
                WHEN 'skip'     THEN -1.0
                ELSE 0.0 END)::REAL AS weight
    FROM user_song_interactions interaction
    WHERE interaction.user_id IN (SELECT user_id FROM showcase_personas)
      AND interaction.interaction_type IN ('play', 'complete', 'skip', 'replay')
    GROUP BY interaction.user_id, interaction.song_id
),
liked_weights AS (
    SELECT DISTINCT playlist.owner_id AS user_id, ps.song_id, 3.0::REAL AS weight
    FROM playlist_songs ps
    JOIN playlists playlist ON playlist.id = ps.playlist_id
    WHERE playlist.owner_id IN (SELECT user_id FROM showcase_personas)
      AND playlist.title = 'Liked Songs'
),
combined_weights AS (
    SELECT user_id, song_id, SUM(weight)::REAL AS weight
    FROM (SELECT * FROM playback_weights UNION ALL SELECT * FROM liked_weights) all_weights
    GROUP BY user_id, song_id
    HAVING SUM(weight) <> 0
),
components AS (
    SELECT weights.user_id, component.ordinality AS dimension,
        SUM(component.value * weights.weight)::DOUBLE PRECISION AS weighted_value
    FROM combined_weights weights
    JOIN songs song ON song.id = weights.song_id
     AND song.normalized_vector IS NOT NULL AND cardinality(song.normalized_vector) = 6
    CROSS JOIN LATERAL unnest(song.normalized_vector) WITH ORDINALITY AS component(value, ordinality)
    GROUP BY weights.user_id, component.ordinality
),
norms AS (
    SELECT user_id, SQRT(SUM(weighted_value * weighted_value)) AS vector_norm
    FROM components GROUP BY user_id
),
normalized AS (
    SELECT components.user_id,
        ARRAY_AGG((components.weighted_value / norms.vector_norm)::REAL ORDER BY components.dimension) AS preference_vector
    FROM components JOIN norms USING (user_id)
    WHERE norms.vector_norm > 1e-8
    GROUP BY components.user_id
)
INSERT INTO user_preferences (user_id, preference_vector, updated_at)
SELECT user_id, preference_vector, NOW() FROM normalized;

DO $$
DECLARE
    preference_count INTEGER;
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO preference_count
    FROM user_preferences preference
    JOIN showcase_personas persona ON persona.user_id = preference.user_id;

    IF preference_count <> 14 THEN
        RAISE EXCEPTION
            'Expected 14 personalized showcase users and 1 cold-start user, but generated % preference vectors.',
            preference_count;
    END IF;

    SELECT COUNT(*) INTO invalid_count
    FROM user_preferences preference
    JOIN showcase_personas persona ON persona.user_id = preference.user_id
    WHERE cardinality(preference.preference_vector) <> 6;

    IF invalid_count <> 0 THEN
        RAISE EXCEPTION 'Generated showcase preference vectors are not 6D.';
    END IF;
END
$$;

\echo ''
\echo 'Showcase seed summary:'
SELECT persona.user_no, persona.email, persona.persona_title,
    COUNT(DISTINCT ps.song_id) AS liked_songs,
    COUNT(DISTINCT pb.song_id) FILTER (WHERE pb.interaction_type <> 'like') AS playback_rows,
    COALESCE(cardinality(pref.preference_vector), 0) AS preference_dims
FROM showcase_personas persona
LEFT JOIN playlists pl ON pl.owner_id = persona.user_id AND pl.title = 'Liked Songs'
LEFT JOIN playlist_songs ps ON ps.playlist_id = pl.id
LEFT JOIN user_song_interactions pb ON pb.user_id = persona.user_id
LEFT JOIN user_preferences pref ON pref.user_id = persona.user_id
GROUP BY persona.user_no, persona.email, persona.persona_title, pref.preference_vector
ORDER BY persona.user_no;

COMMIT;

\echo ''
\echo 'ML showcase seed loaded. Every showcase user password: Password123!'
\echo 'showcase15@bside.local is intentionally a cold-start user.'
