\set ON_ERROR_STOP on
\echo 'Loading B-Side ML showcase users/interactions...'
\echo 'Prerequisite: upload the showcase songs first and wait until ML marks them Ready.'

BEGIN;
SET LOCAL TIME ZONE 'UTC';

-- -----------------------------------------------------------------------------
-- 0. Recommendation compatibility guard
-- -----------------------------------------------------------------------------
-- The current ML callback accepts exactly 6 normalized values. Old development
-- seed songs use legacy 3D vectors; keeping them Ready would make cosine
-- similarity return 0 against new 6D user preferences and pollute Daily Mix.
UPDATE songs
SET status = 'Failed'
WHERE status::text = 'Ready'
  AND normalized_vector IS NOT NULL
  AND cardinality(normalized_vector) <> 6;

CREATE TEMP TABLE showcase_song_targets (
    song_key TEXT PRIMARY KEY,
    artist_name TEXT NOT NULL,
    title_pattern TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO showcase_song_targets (song_key, artist_name, title_pattern)
VALUES
    ('igotta',    'Black Eyed Peas',   'I Gotta Feeling'),
    ('oops',      'Britney Spears',    'Oops!...I Did It Again'),
    ('womanizer', 'Britney Spears',    'Womanizer'),
    ('jerk',      'Caesars',           'Jerk It Out'),
    ('cantstop',  'Justin Timberlake', 'CANT STOP THE FEELING%'),
    ('gimme',     'ABBA',              'Gimme! Gimme! Gimme!%'),
    ('betteroff', 'Alice Deejay',      'Better Off Alone'),
    ('everybody', 'Backstreet Boys',   'Everybody%');

-- If a song was uploaded more than once, use the newest ML-ready copy.
CREATE TEMP TABLE showcase_songs ON COMMIT DROP AS
SELECT DISTINCT ON (target.song_key)
    target.song_key,
    song.id AS song_id,
    song.title,
    artist.name AS artist_name,
    song.duration_seconds,
    song.normalized_vector,
    song.created_at
FROM showcase_song_targets target
JOIN artists artist
  ON lower(artist.name) = lower(target.artist_name)
JOIN albums album
  ON album.artist_id = artist.id
JOIN songs song
  ON song.album_id = album.id
 AND song.title ILIKE target.title_pattern
WHERE song.status::text = 'Ready'
  AND album.status = 'Ready'
  AND song.normalized_vector IS NOT NULL
ORDER BY target.song_key, song.created_at DESC;

DO $$
DECLARE
    missing_keys TEXT;
    bad_vectors TEXT;
BEGIN
    SELECT string_agg(target.song_key, ', ' ORDER BY target.song_key)
      INTO missing_keys
    FROM showcase_song_targets target
    LEFT JOIN showcase_songs resolved USING (song_key)
    WHERE resolved.song_id IS NULL;

    IF missing_keys IS NOT NULL THEN
        RAISE EXCEPTION
            'ML showcase songs are missing/not Ready: %. Upload them, wait for the ML callback, then rerun this seed.',
            missing_keys;
    END IF;

    SELECT string_agg(song_key || '=' || cardinality(normalized_vector)::text, ', ' ORDER BY song_key)
      INTO bad_vectors
    FROM showcase_songs
    WHERE cardinality(normalized_vector) <> 6;

    IF bad_vectors IS NOT NULL THEN
        RAISE EXCEPTION
            'Showcase songs must all have 6D normalized_vector values. Invalid: %',
            bad_vectors;
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 1. Deterministic demo users
-- -----------------------------------------------------------------------------
-- Safe to rerun: only users created by this showcase seed are replaced.
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
    ( 1, 'a1000000-0000-4000-8000-000000000001', 'showcase01@bside.local', 'showcase_party_pop',      'Ava Party',      'Party Pop',       'High-energy pop and feel-good party tracks.'),
    ( 2, 'a1000000-0000-4000-8000-000000000002', 'showcase02@bside.local', 'showcase_pop_2000',       'Ben Pop',        '2000s Pop',       'Mainstream 2000s pop with strong vocal hooks.'),
    ( 3, 'a1000000-0000-4000-8000-000000000003', 'showcase03@bside.local', 'showcase_eurodance',      'Clara Dance',    'Eurodance',       'Dance-floor electronic and disco-influenced pop.'),
    ( 4, 'a1000000-0000-4000-8000-000000000004', 'showcase04@bside.local', 'showcase_rock_energy',    'Dylan Rock',     'Rock Energy',     'Guitar-driven energetic tracks with party crossover.'),
    ( 5, 'a1000000-0000-4000-8000-000000000005', 'showcase05@bside.local', 'showcase_disco',          'Emma Disco',     'Disco Feelgood',  'Retro disco and bright sing-along pop.'),
    ( 6, 'a1000000-0000-4000-8000-000000000006', 'showcase06@bside.local', 'showcase_party_2000',     'Finn Y2K',       'Y2K Party',       'Late-90s/2000s party-pop nostalgia.'),
    ( 7, 'a1000000-0000-4000-8000-000000000007', 'showcase07@bside.local', 'showcase_britney',        'Grace Britney',  'Britney Fan',     'Strong preference for Britney-style pop.'),
    ( 8, 'a1000000-0000-4000-8000-000000000008', 'showcase08@bside.local', 'showcase_retro_dance',    'Hugo Retro',     'Retro Dance',     'Classic dance-pop and Eurodance.'),
    ( 9, 'a1000000-0000-4000-8000-000000000009', 'showcase09@bside.local', 'showcase_feelgood',       'Iris Feelgood',  'Feel Good',       'Optimistic, upbeat, crowd-friendly songs.'),
    (10, 'a1000000-0000-4000-8000-000000000010', 'showcase10@bside.local', 'showcase_club',           'Jack Club',      'Club Electronic', 'Electronic club energy with modern pop crossover.'),
    (11, 'a1000000-0000-4000-8000-000000000011', 'showcase11@bside.local', 'showcase_indie',          'Kim Explorer',   'Indie Explorer',  'Alternative/indie first, but open to electronic discovery.'),
    (12, 'a1000000-0000-4000-8000-000000000012', 'showcase12@bside.local', 'showcase_balanced',       'Leo Balanced',   'Balanced Mix',    'Mixed taste across rock, pop and disco.'),
    (13, 'a1000000-0000-4000-8000-000000000013', 'showcase13@bside.local', 'showcase_nostalgia',      'Mia Nostalgia',  'Pop Nostalgia',   'Late-90s/early-2000s nostalgia with a disco edge.'),
    (14, 'a1000000-0000-4000-8000-000000000014', 'showcase14@bside.local', 'showcase_high_energy',    'Nolan Energy',   'High Energy',     'Fast, energetic tracks regardless of genre.'),
    (15, 'a1000000-0000-4000-8000-000000000015', 'showcase15@bside.local', 'showcase_cold_start',     'Olivia New',     'Cold Start',      'No listening history: demonstrates catalog fallback.');

INSERT INTO users (
    id, email, username, display_name, role, avatar_url, is_banned, created_at
)
SELECT
    user_id,
    email,
    username,
    display_name,
    'User',
    NULL,
    FALSE,
    NOW() - INTERVAL '30 days' + (user_no * INTERVAL '5 minutes')
FROM showcase_personas;

-- Password for every showcase account: Password123!
INSERT INTO local_credentials (user_id, password_hash, updated_at)
SELECT
    user_id,
    '$argon2id$v=19$m=65536,t=3,p=4$33/7ja3/RkOyZ2txgRiKAA$e4O6VrVboflB6TM9C/bNskyNvt9A18eUl33ezgmIHN8',
    NOW()
FROM showcase_personas;

-- -----------------------------------------------------------------------------
-- 2. Liked Songs + visible persona playlists
-- -----------------------------------------------------------------------------
INSERT INTO playlists (
    id, owner_id, title, description, cover_url, is_public,
    created_at, total_duration, song_count, ml_features
)
SELECT
    gen_random_uuid(),
    user_id,
    'Liked Songs',
    'ML showcase liked songs for ' || display_name || '.',
    NULL,
    FALSE,
    NOW() - INTERVAL '14 days',
    0,
    0,
    '{}'::jsonb
FROM showcase_personas;

INSERT INTO playlists (
    id, owner_id, title, description, cover_url, is_public,
    created_at, total_duration, song_count, ml_features
)
SELECT
    gen_random_uuid(),
    user_id,
    'Showcase - ' || persona_title,
    persona_description,
    NULL,
    TRUE,
    NOW() - INTERVAL '10 days',
    0,
    0,
    '{}'::jsonb
FROM showcase_personas;

CREATE TEMP TABLE showcase_likes (
    user_no INTEGER NOT NULL,
    song_key TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (user_no, song_key)
) ON COMMIT DROP;

INSERT INTO showcase_likes (user_no, song_key, position)
VALUES
    ( 1, 'igotta',    1), ( 1, 'cantstop',  2), ( 1, 'womanizer', 3),
    ( 2, 'oops',      1), ( 2, 'womanizer', 2), ( 2, 'everybody', 3),
    ( 3, 'betteroff', 1), ( 3, 'gimme',     2), ( 3, 'igotta',    3),
    ( 4, 'jerk',      1), ( 4, 'igotta',    2), ( 4, 'cantstop',  3),
    ( 5, 'gimme',     1), ( 5, 'cantstop',  2), ( 5, 'everybody', 3),
    ( 6, 'igotta',    1), ( 6, 'everybody', 2), ( 6, 'womanizer', 3),
    ( 7, 'oops',      1), ( 7, 'womanizer', 2),
    ( 8, 'gimme',     1), ( 8, 'betteroff', 2), ( 8, 'everybody', 3),
    ( 9, 'cantstop',  1), ( 9, 'igotta',    2), ( 9, 'gimme',     3),
    (10, 'betteroff', 1), (10, 'igotta',    2), (10, 'womanizer', 3),
    (11, 'jerk',      1), (11, 'betteroff', 2),
    (12, 'jerk',      1), (12, 'womanizer', 2), (12, 'gimme',     3),
    (13, 'everybody', 1), (13, 'oops',      2), (13, 'gimme',     3),
    (14, 'igotta',    1), (14, 'womanizer', 2), (14, 'jerk',      3);

-- Liked Songs drives LIKE_WEIGHT (+3.0) in preferences.rs.
INSERT INTO playlist_songs (id, playlist_id, song_id, position, added_at)
SELECT
    gen_random_uuid(),
    playlist.id,
    song.song_id,
    likes.position,
    NOW() - INTERVAL '9 days' + (likes.position * INTERVAL '2 minutes')
FROM showcase_likes likes
JOIN showcase_personas persona USING (user_no)
JOIN playlists playlist
  ON playlist.owner_id = persona.user_id
 AND playlist.title = 'Liked Songs'
JOIN showcase_songs song USING (song_key);

-- The public showcase playlist mirrors each persona's likes, making the demo
-- visible in the UI without changing recommendation weights.
INSERT INTO playlist_songs (id, playlist_id, song_id, position, added_at)
SELECT
    gen_random_uuid(),
    playlist.id,
    song.song_id,
    likes.position,
    NOW() - INTERVAL '8 days' + (likes.position * INTERVAL '2 minutes')
FROM showcase_likes likes
JOIN showcase_personas persona USING (user_no)
JOIN playlists playlist
  ON playlist.owner_id = persona.user_id
 AND playlist.title = 'Showcase - ' || persona.persona_title
JOIN showcase_songs song USING (song_key);

-- Keep the cached playlist counters consistent with playlist_songs.
UPDATE playlists playlist
SET
    song_count = stats.song_count,
    total_duration = stats.total_duration
FROM (
    SELECT
        ps.playlist_id,
        COUNT(*)::INTEGER AS song_count,
        COALESCE(SUM(song.duration_seconds), 0)::INTEGER AS total_duration
    FROM playlist_songs ps
    JOIN songs song ON song.id = ps.song_id
    GROUP BY ps.playlist_id
) stats
WHERE playlist.id = stats.playlist_id
  AND playlist.owner_id IN (SELECT user_id FROM showcase_personas);

-- -----------------------------------------------------------------------------
-- 3. Listening/skip/replay matrix
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE showcase_playback (
    user_no INTEGER NOT NULL,
    song_key TEXT NOT NULL,
    interaction_type VARCHAR(30) NOT NULL,
    days_ago INTEGER NOT NULL,
    sequence_no INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO showcase_playback (user_no, song_key, interaction_type, days_ago, sequence_no)
VALUES
    ( 1, 'igotta',    'complete', 6, 1), ( 1, 'cantstop',  'replay',   5, 2), ( 1, 'womanizer', 'complete', 4, 3), ( 1, 'jerk',      'skip', 2, 4),
    ( 2, 'oops',      'replay',   6, 1), ( 2, 'womanizer', 'complete', 5, 2), ( 2, 'everybody', 'complete', 4, 3), ( 2, 'betteroff', 'skip', 2, 4),
    ( 3, 'betteroff', 'replay',   6, 1), ( 3, 'gimme',     'complete', 5, 2), ( 3, 'igotta',    'play',     4, 3), ( 3, 'jerk',      'skip', 2, 4),
    ( 4, 'jerk',      'replay',   6, 1), ( 4, 'igotta',    'complete', 5, 2), ( 4, 'cantstop',  'play',     4, 3), ( 4, 'oops',      'skip', 2, 4),
    ( 5, 'gimme',     'replay',   6, 1), ( 5, 'cantstop',  'complete', 5, 2), ( 5, 'everybody', 'play',     4, 3), ( 5, 'womanizer', 'skip', 2, 4),
    ( 6, 'igotta',    'replay',   6, 1), ( 6, 'everybody', 'complete', 5, 2), ( 6, 'womanizer', 'complete', 4, 3), ( 6, 'gimme',     'skip', 2, 4),
    ( 7, 'oops',      'replay',   6, 1), ( 7, 'womanizer', 'replay',   5, 2), ( 7, 'everybody', 'complete', 4, 3), ( 7, 'jerk',      'skip', 2, 4),
    ( 8, 'gimme',     'complete', 6, 1), ( 8, 'betteroff', 'replay',   5, 2), ( 8, 'everybody', 'complete', 4, 3), ( 8, 'womanizer', 'skip', 2, 4),
    ( 9, 'cantstop',  'replay',   6, 1), ( 9, 'igotta',    'complete', 5, 2), ( 9, 'gimme',     'complete', 4, 3), ( 9, 'betteroff', 'skip', 2, 4),
    (10, 'betteroff', 'replay',   6, 1), (10, 'igotta',    'complete', 5, 2), (10, 'womanizer', 'play',     4, 3), (10, 'everybody', 'skip', 2, 4),
    (11, 'jerk',      'replay',   6, 1), (11, 'betteroff', 'complete', 5, 2), (11, 'gimme',     'play',     4, 3), (11, 'oops',      'skip', 2, 4),
    (12, 'jerk',      'complete', 6, 1), (12, 'womanizer', 'complete', 5, 2), (12, 'gimme',     'complete', 4, 3), (12, 'betteroff', 'skip', 2, 4),
    (13, 'everybody', 'replay',   6, 1), (13, 'oops',      'complete', 5, 2), (13, 'gimme',     'complete', 4, 3), (13, 'igotta',    'skip', 2, 4),
    (14, 'igotta',    'replay',   6, 1), (14, 'womanizer', 'complete', 5, 2), (14, 'jerk',      'complete', 4, 3), (14, 'gimme',     'skip', 2, 4);

-- Mirror API like events for analytics/history. Preference LIKE_WEIGHT itself is
-- taken from the Liked Songs playlist, exactly like preferences.rs.
INSERT INTO user_song_interactions (
    id, user_id, song_id, interaction_type, listened_seconds, song_duration_seconds, created_at
)
SELECT
    gen_random_uuid(),
    persona.user_id,
    song.song_id,
    'like',
    NULL,
    NULL,
    NOW() - INTERVAL '9 days' + (likes.position * INTERVAL '3 minutes')
FROM showcase_likes likes
JOIN showcase_personas persona USING (user_no)
JOIN showcase_songs song USING (song_key);

INSERT INTO user_song_interactions (
    id, user_id, song_id, interaction_type, listened_seconds, song_duration_seconds, created_at
)
SELECT
    gen_random_uuid(),
    persona.user_id,
    song.song_id,
    playback.interaction_type,
    CASE playback.interaction_type
        WHEN 'complete' THEN song.duration_seconds
        WHEN 'replay'   THEN song.duration_seconds
        WHEN 'play'     THEN GREATEST(1, ROUND(song.duration_seconds * 0.65)::INTEGER)
        WHEN 'skip'     THEN GREATEST(5, ROUND(song.duration_seconds * 0.20)::INTEGER)
        ELSE NULL
    END,
    song.duration_seconds,
    NOW()
      - (playback.days_ago * INTERVAL '1 day')
      + (playback.sequence_no * INTERVAL '7 minutes')
FROM showcase_playback playback
JOIN showcase_personas persona USING (user_no)
JOIN showcase_songs song USING (song_key);

-- -----------------------------------------------------------------------------
-- 4. Rebuild preference vectors using the same weights as src/preferences.rs
-- -----------------------------------------------------------------------------
DELETE FROM user_preferences
WHERE user_id IN (SELECT user_id FROM showcase_personas);

WITH playback_weights AS (
    SELECT
        interaction.user_id,
        interaction.song_id,
        SUM(
            CASE interaction.interaction_type
                WHEN 'replay'   THEN  2.0
                WHEN 'complete' THEN  1.5
                WHEN 'play'     THEN  0.5
                WHEN 'skip'     THEN -1.0
                ELSE 0.0
            END
        )::REAL AS weight
    FROM user_song_interactions interaction
    WHERE interaction.user_id IN (SELECT user_id FROM showcase_personas)
      AND interaction.interaction_type IN ('play', 'complete', 'skip', 'replay')
    GROUP BY interaction.user_id, interaction.song_id
),
liked_weights AS (
    SELECT DISTINCT
        playlist.owner_id AS user_id,
        ps.song_id,
        3.0::REAL AS weight
    FROM playlist_songs ps
    JOIN playlists playlist ON playlist.id = ps.playlist_id
    WHERE playlist.owner_id IN (SELECT user_id FROM showcase_personas)
      AND playlist.title = 'Liked Songs'
),
combined_weights AS (
    SELECT user_id, song_id, SUM(weight)::REAL AS weight
    FROM (
        SELECT * FROM playback_weights
        UNION ALL
        SELECT * FROM liked_weights
    ) all_weights
    GROUP BY user_id, song_id
    HAVING SUM(weight) <> 0
),
components AS (
    SELECT
        weights.user_id,
        component.ordinality AS dimension,
        SUM(component.value * weights.weight)::DOUBLE PRECISION AS weighted_value
    FROM combined_weights weights
    JOIN songs song
      ON song.id = weights.song_id
     AND song.normalized_vector IS NOT NULL
     AND cardinality(song.normalized_vector) = 6
    CROSS JOIN LATERAL unnest(song.normalized_vector)
        WITH ORDINALITY AS component(value, ordinality)
    GROUP BY weights.user_id, component.ordinality
),
norms AS (
    SELECT
        user_id,
        SQRT(SUM(weighted_value * weighted_value)) AS vector_norm
    FROM components
    GROUP BY user_id
),
normalized AS (
    SELECT
        components.user_id,
        ARRAY_AGG(
            (components.weighted_value / norms.vector_norm)::REAL
            ORDER BY components.dimension
        ) AS preference_vector
    FROM components
    JOIN norms USING (user_id)
    WHERE norms.vector_norm > 1e-8
    GROUP BY components.user_id
)
INSERT INTO user_preferences (user_id, preference_vector, updated_at)
SELECT user_id, preference_vector, NOW()
FROM normalized;

-- The cold-start account intentionally has no preference vector.
DO $$
DECLARE
    preference_count INTEGER;
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*)
      INTO preference_count
    FROM user_preferences preference
    JOIN showcase_personas persona ON persona.user_id = preference.user_id;

    IF preference_count <> 14 THEN
        RAISE EXCEPTION
            'Expected 14 personalized showcase users and 1 cold-start user, but generated % preference vectors.',
            preference_count;
    END IF;

    SELECT COUNT(*)
      INTO invalid_count
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
SELECT
    persona.user_no,
    persona.email,
    persona.persona_title,
    COUNT(DISTINCT likes.song_key) AS liked_songs,
    COUNT(DISTINCT playback.song_key) AS playback_songs,
    COALESCE(cardinality(preference.preference_vector), 0) AS preference_dimensions
FROM showcase_personas persona
LEFT JOIN showcase_likes likes USING (user_no)
LEFT JOIN showcase_playback playback USING (user_no)
LEFT JOIN user_preferences preference ON preference.user_id = persona.user_id
GROUP BY
    persona.user_no,
    persona.email,
    persona.persona_title,
    preference.preference_vector
ORDER BY persona.user_no;

COMMIT;

\echo ''
\echo 'ML showcase seed loaded.'
\echo 'Every showcase user password: Password123!'
\echo 'showcase15@bside.local is intentionally a cold-start user.'
