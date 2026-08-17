BEGIN;

-- Test artist used only for preference-vector demonstrations.
INSERT INTO artists (
    id,
    name,
    bio,
    photo_url,
    status
)
VALUES (
           '91000000-0000-4000-8000-000000000001',
           'Preference Test Artist',
           'Test artist used for preference weighting demonstrations.',
           'https://localhost/bside-covers/default_artist.jpg',
           'Ready'
       )
    ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
                            bio = EXCLUDED.bio,
                            photo_url = EXCLUDED.photo_url,
                            status = EXCLUDED.status;


-- Test album containing three songs with simple artificial vectors.
INSERT INTO albums (
    id,
    artist_id,
    title,
    genre,
    cover_url,
    status
)
VALUES (
           '92000000-0000-4000-8000-000000000001',
           '91000000-0000-4000-8000-000000000001',
           'Preference Test Album',
           'Test',
           'https://localhost/bside-covers/default_album.jpg',
           'Ready'
       )
    ON CONFLICT (id) DO UPDATE SET
    artist_id = EXCLUDED.artist_id,
                            title = EXCLUDED.title,
                            genre = EXCLUDED.genre,
                            cover_url = EXCLUDED.cover_url,
                            status = EXCLUDED.status;


-- Song A: first vector direction.
INSERT INTO songs (
    id,
    album_id,
    title,
    duration_seconds,
    audio_url,
    ml_features,
    status,
    normalized_vector
)
VALUES (
           '93000000-0000-4000-8000-000000000001',
           '92000000-0000-4000-8000-000000000001',
           'Preference Test Song A',
           180,
           'test/preference-song-a.mp3',
           '{}'::jsonb,
           'Ready',
           ARRAY[1.0::real, 0.0::real, 0.0::real]
       )
    ON CONFLICT (id) DO UPDATE SET
    album_id = EXCLUDED.album_id,
                            title = EXCLUDED.title,
                            duration_seconds = EXCLUDED.duration_seconds,
                            audio_url = EXCLUDED.audio_url,
                            ml_features = EXCLUDED.ml_features,
                            status = EXCLUDED.status,
                            normalized_vector = EXCLUDED.normalized_vector;


-- Song B: second vector direction.
INSERT INTO songs (
    id,
    album_id,
    title,
    duration_seconds,
    audio_url,
    ml_features,
    status,
    normalized_vector
)
VALUES (
           '93000000-0000-4000-8000-000000000002',
           '92000000-0000-4000-8000-000000000001',
           'Preference Test Song B',
           180,
           'test/preference-song-b.mp3',
           '{}'::jsonb,
           'Ready',
           ARRAY[0.0::real, 1.0::real, 0.0::real]
       )
    ON CONFLICT (id) DO UPDATE SET
    album_id = EXCLUDED.album_id,
                            title = EXCLUDED.title,
                            duration_seconds = EXCLUDED.duration_seconds,
                            audio_url = EXCLUDED.audio_url,
                            ml_features = EXCLUDED.ml_features,
                            status = EXCLUDED.status,
                            normalized_vector = EXCLUDED.normalized_vector;


-- Song C: third vector direction.
INSERT INTO songs (
    id,
    album_id,
    title,
    duration_seconds,
    audio_url,
    ml_features,
    status,
    normalized_vector
)
VALUES (
           '93000000-0000-4000-8000-000000000003',
           '92000000-0000-4000-8000-000000000001',
           'Preference Test Song C',
           180,
           'test/preference-song-c.mp3',
           '{}'::jsonb,
           'Ready',
           ARRAY[0.0::real, 0.0::real, 1.0::real]
       )
    ON CONFLICT (id) DO UPDATE SET
    album_id = EXCLUDED.album_id,
                            title = EXCLUDED.title,
                            duration_seconds = EXCLUDED.duration_seconds,
                            audio_url = EXCLUDED.audio_url,
                            ml_features = EXCLUDED.ml_features,
                            status = EXCLUDED.status,
                            normalized_vector = EXCLUDED.normalized_vector;

COMMIT;
