CREATE TABLE daily_mixes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generation_date DATE NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT daily_mixes_user_date_unique UNIQUE (user_id, generation_date)
);

CREATE TABLE daily_mix_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_mix_id UUID NOT NULL REFERENCES daily_mixes(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position > 0),
    is_discovery BOOLEAN NOT NULL,
    score REAL NOT NULL,
    selection_reason VARCHAR(30) NOT NULL,
    CONSTRAINT daily_mix_songs_mix_song_unique UNIQUE (daily_mix_id, song_id),
    CONSTRAINT daily_mix_songs_mix_position_unique UNIQUE (daily_mix_id, position),
    CONSTRAINT daily_mix_songs_reason_check
        CHECK (selection_reason IN ('taste_discovery', 'taste_familiar', 'catalog_fallback'))
);

CREATE INDEX daily_mixes_user_date_idx ON daily_mixes(user_id, generation_date DESC);
CREATE INDEX daily_mix_songs_mix_position_idx ON daily_mix_songs(daily_mix_id, position);

