-- Add migration script here
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS messages (
                                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    content TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'sent',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ
    );

CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver
    ON messages(sender_id, receiver_id);

CREATE INDEX IF NOT EXISTS idx_messages_receiver_sender
    ON messages(receiver_id, sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at);