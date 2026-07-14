BEGIN;

-- Test artist used only for song-sharing tests.
INSERT INTO artists (
    id,
    user_id,
    name,
    bio,
    photo_url,
    status
)
VALUES (
           '90000000-0000-4000-8000-000000000001',
           NULL,
           'WebSocket Test Artist',
           'Artist created for WebSocket song-sharing tests.',
           'http://localhost:9000/bside-covers/default_artist.jpg',
           'Ready'
       )
    ON CONFLICT (id) DO UPDATE
                            SET
                                name = EXCLUDED.name,
                            bio = EXCLUDED.bio,
                            photo_url = EXCLUDED.photo_url,
                            status = EXCLUDED.status;

-- Test album.
INSERT INTO albums (
    id,
    artist_id,
    title,
    genre,
    cover_url,
    status
)
VALUES (
           '90000000-0000-4000-8000-000000000002',
           '90000000-0000-4000-8000-000000000001',
           'WebSocket Test Album',
           'Test',
           'http://localhost:9000/bside-covers/default_cover.jpg',
           'Ready'
       )
    ON CONFLICT (id) DO UPDATE
                            SET
                                artist_id = EXCLUDED.artist_id,
                            title = EXCLUDED.title,
                            genre = EXCLUDED.genre,
                            cover_url = EXCLUDED.cover_url,
                            status = EXCLUDED.status;

-- Test song.
INSERT INTO songs (
    id,
    title,
    album_id,
    duration_seconds,
    audio_url,
    status,
    ml_features
)
VALUES (
           '90000000-0000-4000-8000-000000000003',
           'WebSocket Test Song',
           '90000000-0000-4000-8000-000000000002',
           180,
           'test/websocket-test-song.wav',
           'Ready'::song_status,
           '{}'::jsonb
       )
    ON CONFLICT (id) DO UPDATE
                            SET
                                title = EXCLUDED.title,
                            album_id = EXCLUDED.album_id,
                            duration_seconds = EXCLUDED.duration_seconds,
                            audio_url = EXCLUDED.audio_url,
                            status = EXCLUDED.status,
                            ml_features = EXCLUDED.ml_features;

COMMIT;

SELECT
    s.id AS song_id,
    s.title,
    s.status::text AS status,
    a.title AS album_title,
    ar.name AS artist_name
FROM songs s
         JOIN albums a ON a.id = s.album_id
         JOIN artists ar ON ar.id = a.artist_id
WHERE s.id = '90000000-0000-4000-8000-000000000003';