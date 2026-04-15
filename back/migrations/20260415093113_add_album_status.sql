ALTER TABLE albums
ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'Ready';
CREATE INDEX idx_albums_status ON albums(status);
