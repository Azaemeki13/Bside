ALTER TABLE albums
ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'Ready';
ALTER TABLE albums ALTER COLUMN cover_url SET NOT NULL;
CREATE INDEX idx_albums_status ON albums(status);
