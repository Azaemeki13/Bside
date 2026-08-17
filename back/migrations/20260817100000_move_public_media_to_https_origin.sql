-- Media used to be exposed directly from MinIO over HTTP and briefly through
-- a separate HTTPS port. Keep existing rows compatible with the single-origin
-- HTTPS gateway used by the browser.
UPDATE users
SET avatar_url = regexp_replace(
    avatar_url,
    '^https?://(localhost:9000|minio:9000|localhost:9443)',
    'https://localhost'
)
WHERE avatar_url ~ '^https?://(localhost:9000|minio:9000|localhost:9443)';

UPDATE artists
SET photo_url = regexp_replace(
    photo_url,
    '^https?://(localhost:9000|minio:9000|localhost:9443)',
    'https://localhost'
)
WHERE photo_url ~ '^https?://(localhost:9000|minio:9000|localhost:9443)';

UPDATE albums
SET cover_url = regexp_replace(
    cover_url,
    '^https?://(localhost:9000|minio:9000|localhost:9443)',
    'https://localhost'
)
WHERE cover_url ~ '^https?://(localhost:9000|minio:9000|localhost:9443)';

UPDATE playlists
SET cover_url = regexp_replace(
    cover_url,
    '^https?://(localhost:9000|minio:9000|localhost:9443)',
    'https://localhost'
)
WHERE cover_url ~ '^https?://(localhost:9000|minio:9000|localhost:9443)';

ALTER TABLE artists
ALTER COLUMN photo_url SET DEFAULT 'https://localhost/bside-covers/default_artist.jpg';
