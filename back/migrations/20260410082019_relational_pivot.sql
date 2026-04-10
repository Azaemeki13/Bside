CREATE TABLE artist_profiles (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_id UUID NOT NULL,
	name TEXT NOT NULL UNIQUE,
	description TEXT,
	picture_url TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE album_type AS ENUM ('LP', 'EP', 'Single');

CREATE TABLE albums (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	description TEXT,
	cover_url TEXT,
	release_type album_type NOT NULL DEFAULT 'LP',
	created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS songs CASCADE;
DROP TABLE IF EXISTS playlists CASCADE;
DROP TABLE IF EXISTS playlist_songs CASCADE;

CREATE TABLE songs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	duration_seconds INTEGER NOT NULL,
	audio_url TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'Pending',
	ml_features JSONB DEFAULT '{}',
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE song_artists (
	song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
	artist_id UUID REFERENCES artist_profiles(id) ON DELETE CASCADE,
	is_primary BOOLEAN DEFAULT false,
	PRIMARY KEY(song_id, artist_id)
);

CREATE TABLE playlists (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_id UUID NOT NULL,
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

CREATE INDEX idx_playlist_owner ON playlists(owner_id);
