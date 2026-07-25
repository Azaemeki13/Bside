-- Add migration script here
CREATE TABLE IF NOT EXISTS user_preferences (
                                                user_id UUID PRIMARY KEY
                                                REFERENCES users(id)
    ON DELETE CASCADE,

    preference_vector FLOAT4[] NOT NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);