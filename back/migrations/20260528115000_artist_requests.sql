CREATE TABLE IF NOT EXISTS artist_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_name VARCHAR(255) NOT NULL,
    bio TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT artist_requests_status_check CHECK (status IN ('Pending', 'Accepted', 'Denied'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_requests_one_pending_per_user
    ON artist_requests(user_id)
    WHERE status = 'Pending';

CREATE INDEX IF NOT EXISTS idx_artist_requests_status_created
    ON artist_requests(status, created_at DESC);
