CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS user_song_interactions (
                                                      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

    song_id UUID NOT NULL
    REFERENCES songs(id)
    ON DELETE CASCADE,

    interaction_type VARCHAR(30) NOT NULL,

    listened_seconds INTEGER,
    song_duration_seconds INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_user_song_interaction_type
    CHECK (
              interaction_type IN (
              'like',
              'unlike',
              'play',
              'complete',
              'skip',
              'replay'
                                  )
    ),

    CONSTRAINT chk_user_song_listened_seconds
    CHECK (
              listened_seconds IS NULL
              OR listened_seconds >= 0
          ),

    CONSTRAINT chk_user_song_duration_seconds
    CHECK (
              song_duration_seconds IS NULL
              OR song_duration_seconds > 0
          )
    );

CREATE INDEX IF NOT EXISTS idx_user_song_interactions_user_created_at
    ON user_song_interactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_song_interactions_song_created_at
    ON user_song_interactions (song_id, created_at DESC);