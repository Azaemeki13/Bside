ALTER TABLE artists
ADD COLUMN api_managed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_artists_api_managed ON artists (api_managed)
WHERE api_managed = TRUE;
