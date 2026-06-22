BEGIN;

-- =========================================================
-- Chat seed data for B-Side
-- Purpose:
--   - create several usable accounts
--   - create private messages between them
--   - allow testing: WebSocket, history, read/unread, chat list
-- Password for all seeded accounts:
--   Password123!
-- =========================================================

-- 1. Remove previous chat seed data safely
DELETE FROM messages
WHERE sender_id IN (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
)
OR receiver_id IN (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
);

DELETE FROM local_credentials
WHERE user_id IN (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
);

DELETE FROM users
WHERE id IN (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
);

-- 2. Insert usable accounts
INSERT INTO users (id, email, username, role, avatar_url)
VALUES
(
    '11111111-1111-4111-8111-111111111111',
    'luna.rivera@bside.local',
    'Luna Rivera',
    'Artist',
    NULL
),
(
    '22222222-2222-4222-8222-222222222222',
    'alex.martin@bside.local',
    'Alex Martin',
    'User',
    NULL
),
(
    '33333333-3333-4333-8333-333333333333',
    'maya.chen@bside.local',
    'Maya Chen',
    'User',
    NULL
),
(
    '44444444-4444-4444-8444-444444444444',
    'noah.bernard@bside.local',
    'Noah Bernard',
    'User',
    NULL
);

-- 3. Insert login credentials
-- Password for all accounts: Password123!
INSERT INTO local_credentials (user_id, password_hash)
VALUES
(
    '11111111-1111-4111-8111-111111111111',
    '$argon2id$v=19$m=65536,t=3,p=4$33/7ja3/RkOyZ2txgRiKAA$e4O6VrVboflB6TM9C/bNskyNvt9A18eUl33ezgmIHN8'
),
(
    '22222222-2222-4222-8222-222222222222',
    '$argon2id$v=19$m=65536,t=3,p=4$MooTKtRUSQhd98UPqtQGsQ$+UYS6/HmJtPsIJOFVEaVgDD4gwWdhgft5gpXedtLk3E'
),
(
    '33333333-3333-4333-8333-333333333333',
    '$argon2id$v=19$m=65536,t=3,p=4$H1PcaGTTQKfC7XvMHINUWQ$fKSUy8PLigbrFL4PDhfvcwNW0jyWqPRGBuscLkkyNlU'
),
(
    '44444444-4444-4444-8444-444444444444',
    '$argon2id$v=19$m=65536,t=3,p=4$D/HnmTWAV6nhrGRplmJmhQ$ehFMB/wzxUaXp7EMCZdPFGYuwILQGV+D+S/dGLgDCNI'
);

-- 4. Insert chat messages
-- Conversation 1: Luna <-> Alex
INSERT INTO messages (
    id,
    sender_id,
    receiver_id,
    content,
    status,
    created_at,
    delivered_at,
    read_at
)
VALUES
(
    'aaaaaaaa-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'Hi Luna, I discovered your latest track yesterday. Really loved the atmosphere.',
    'read',
    NOW() - INTERVAL '45 minutes',
    NOW() - INTERVAL '44 minutes',
    NOW() - INTERVAL '40 minutes'
),
(
    'aaaaaaaa-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'Thank you Alex, I am glad you liked it. I am preparing another release soon.',
    'delivered',
    NOW() - INTERVAL '35 minutes',
    NOW() - INTERVAL '34 minutes',
    NULL
),
(
    'aaaaaaaa-0000-4000-8000-000000000003',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'That sounds great. Will it be available on B-Side first?',
    'delivered',
    NOW() - INTERVAL '25 minutes',
    NOW() - INTERVAL '24 minutes',
    NULL
);

-- Conversation 2: Luna <-> Maya
INSERT INTO messages (
    id,
    sender_id,
    receiver_id,
    content,
    status,
    created_at,
    delivered_at,
    read_at
)
VALUES
(
    'bbbbbbbb-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'Hello Luna, I am building a small playlist and would like to add your song.',
    'read',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '119 minutes',
    NOW() - INTERVAL '110 minutes'
),
(
    'bbbbbbbb-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'Of course, thank you for supporting independent artists.',
    'read',
    NOW() - INTERVAL '105 minutes',
    NOW() - INTERVAL '104 minutes',
    NOW() - INTERVAL '100 minutes'
);

-- Conversation 3: Alex <-> Noah
INSERT INTO messages (
    id,
    sender_id,
    receiver_id,
    content,
    status,
    created_at,
    delivered_at,
    read_at
)
VALUES
(
    'cccccccc-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'Hey Noah, did you listen to Luna Rivera on B-Side?',
    'sent',
    NOW() - INTERVAL '12 minutes',
    NULL,
    NULL
),
(
    'cccccccc-0000-4000-8000-000000000002',
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'Not yet, send me the track later.',
    'delivered',
    NOW() - INTERVAL '8 minutes',
    NOW() - INTERVAL '7 minutes',
    NULL
);

COMMIT;
