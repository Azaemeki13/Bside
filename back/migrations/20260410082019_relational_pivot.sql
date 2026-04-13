CREATE TYPE album_type AS ENUM ('LP', 'EP', 'Single');
CREATE TYPE song_status AS ENUM ('Pending', 'Ready', 'Failed');

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, 
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT NOT NULL DEFAULT 'Uncategorized',
    cover_url TEXT,
    release_type album_type NOT NULL DEFAULT 'LP',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    audio_url TEXT NOT NULL,
    status song_status NOT NULL DEFAULT 'Pending',
    ml_features JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE playlist_songs (
    playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE, 
    song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY(playlist_id, song_id)
);

CREATE INDEX idx_albums_owner ON albums(owner_id);
CREATE INDEX idx_songs_album ON songs(album_id);
CREATE INDEX idx_playlist_owner ON playlists(owner_id);

ALTER TABLE albums
ADD CONSTRAINT unique_user_album_title UNIQUE (owner_id, title);

ALTER TABLE playlists
ADD COLUMN total_duration INTEGER DEFAULT 0,
ADD COLUMN song_count INTEGER DEFAULT 0,
ADD COLUMN ml_features JSONB DEFAULT '{}';

ALTER TABLE playlist_songs DROP CONSTRAINT IF EXISTS playlist_songs_pkey;
ALTER TABLE playlist_songs ADD COLUMN  IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON playlist_songs(playlist_id);
