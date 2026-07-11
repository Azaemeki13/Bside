-- Add message type for text messages and shared-song messages.
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS message_type VARCHAR(20);

-- Existing messages are normal text messages.
UPDATE messages
SET message_type = 'text'
WHERE message_type IS NULL;

ALTER TABLE messages
    ALTER COLUMN message_type SET DEFAULT 'text';

ALTER TABLE messages
    ALTER COLUMN message_type SET NOT NULL;

-- Add the optional shared song reference.
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS song_id UUID;

-- Add the foreign key only when it does not already exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_song_id_fkey'
          AND conrelid = 'messages'::regclass
    ) THEN
ALTER TABLE messages
    ADD CONSTRAINT messages_song_id_fkey
        FOREIGN KEY (song_id)
            REFERENCES songs(id)
            ON DELETE SET NULL;
END IF;
END
$$;

-- Only text and song messages are accepted.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messages_message_type_check'
          AND conrelid = 'messages'::regclass
    ) THEN
ALTER TABLE messages
    ADD CONSTRAINT messages_message_type_check
        CHECK (message_type IN ('text', 'song'));
END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_messages_song_id
    ON messages(song_id);