CREATE TABLE songs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	title VARCHAR(255) NOT NULL,
	artist VARCHAR(255) NOT NULL,
	duration_seconds INTEGER NOT NULL,
	audio_url VARCHAR(255) NOT NULL,
	ml_features JSONB,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
