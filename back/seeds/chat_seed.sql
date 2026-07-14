BEGIN;

-- =========================================================
-- Chat + Social seed data for B-Side
-- Purpose:
--   - create several usable accounts
--   - create private messages between them
--   - create friendships and friend requests
--   - allow testing: WebSocket, history, read/unread, chat list, friends, requests
-- Password for all seeded accounts:
--   Password123!
-- =========================================================

-- Seeded users:
-- Luna Rivera      11111111-1111-4111-8111-111111111111
-- Alex Martin      22222222-2222-4222-8222-222222222222
-- Maya Chen        33333333-3333-4333-8333-333333333333
-- Noah Bernard     44444444-4444-4444-8444-444444444444
-- Ethan Cole       55555555-5555-4555-8555-555555555555

-- 1. Remove previous seed messages safely
DELETE FROM messages
WHERE sender_id IN (
                    '11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                    '33333333-3333-4333-8333-333333333333',
                    '44444444-4444-4444-8444-444444444444',
                    '55555555-5555-4555-8555-555555555555'
    )
   OR receiver_id IN (
                      '11111111-1111-4111-8111-111111111111',
                      '22222222-2222-4222-8222-222222222222',
                      '33333333-3333-4333-8333-333333333333',
                      '44444444-4444-4444-8444-444444444444',
                      '55555555-5555-4555-8555-555555555555'
    );

-- 2. Remove previous seed friendships safely
DELETE FROM friendships
WHERE requester_id IN (
                       '11111111-1111-4111-8111-111111111111',
                       '22222222-2222-4222-8222-222222222222',
                       '33333333-3333-4333-8333-333333333333',
                       '44444444-4444-4444-8444-444444444444',
                       '55555555-5555-4555-8555-555555555555'
    )
   OR addressee_id IN (
                       '11111111-1111-4111-8111-111111111111',
                       '22222222-2222-4222-8222-222222222222',
                       '33333333-3333-4333-8333-333333333333',
                       '44444444-4444-4444-8444-444444444444',
                       '55555555-5555-4555-8555-555555555555'
    );

-- 3. Remove previous local credentials for seeded users
DELETE FROM local_credentials
WHERE user_id IN (
                  '11111111-1111-4111-8111-111111111111',
                  '22222222-2222-4222-8222-222222222222',
                  '33333333-3333-4333-8333-333333333333',
                  '44444444-4444-4444-8444-444444444444',
                  '55555555-5555-4555-8555-555555555555'
    );

-- 4. Insert / update usable accounts
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
    ),
    (
        '55555555-5555-4555-8555-555555555555',
        'ethan.cole@bside.local',
        'Ethan Cole',
        'User',
        NULL
    )
    ON CONFLICT (id) DO UPDATE
                            SET
                                email = EXCLUDED.email,
                            username = EXCLUDED.username,
                            role = EXCLUDED.role,
                            avatar_url = EXCLUDED.avatar_url;

-- 5. Insert login credentials
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
    ),
    (
        '55555555-5555-4555-8555-555555555555',
        '$argon2id$v=19$m=65536,t=3,p=4$33/7ja3/RkOyZ2txgRiKAA$e4O6VrVboflB6TM9C/bNskyNvt9A18eUl33ezgmIHN8'
    );

-- 6. Insert friendships and friend requests
-- From Luna's perspective:
--   Friends:
--     - Alex Martin
--     - Maya Chen
--   Incoming request:
--     - Noah Bernard wants to add Luna
--   Outgoing request:
--     - Luna wants to add Ethan
--
-- From Alex's perspective:
--   Friends:
--     - Luna Rivera
--     - Noah Bernard
INSERT INTO friendships (
    id,
    requester_id,
    addressee_id,
    status,
    created_at,
    updated_at
)
VALUES
    (
        'dddddddd-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'accepted',
        NOW() - INTERVAL '5 days',
        NOW() - INTERVAL '5 days'
    ),
    (
        'dddddddd-0000-4000-8000-000000000002',
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        'accepted',
        NOW() - INTERVAL '4 days',
        NOW() - INTERVAL '4 days'
    ),
    (
        'dddddddd-0000-4000-8000-000000000003',
        '44444444-4444-4444-8444-444444444444',
        '11111111-1111-4111-8111-111111111111',
        'pending',
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '2 days'
    ),
    (
        'dddddddd-0000-4000-8000-000000000004',
        '11111111-1111-4111-8111-111111111111',
        '55555555-5555-4555-8555-555555555555',
        'pending',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 day'
    ),
    (
        'dddddddd-0000-4000-8000-000000000005',
        '22222222-2222-4222-8222-222222222222',
        '44444444-4444-4444-8444-444444444444',
        'accepted',
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '3 days'
    );

-- 7. Insert chat messages

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

-- Conversation 4: Luna <-> Ethan
-- This conversation exists even though Luna's friend request to Ethan is still pending.
-- It helps test whether chat and friendship are independent.
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
        'eeeeeeee-0000-4000-8000-000000000001',
        '55555555-5555-4555-8555-555555555555',
        '11111111-1111-4111-8111-111111111111',
        'Hi Luna, I saw your friend request. I will accept it later.',
        'delivered',
        NOW() - INTERVAL '5 minutes',
        NOW() - INTERVAL '4 minutes',
        NULL
    );

COMMIT;

-- =========================================================
-- Quick verification output
-- =========================================================

SELECT id, username, email, role
FROM users
WHERE id IN (
             '11111111-1111-4111-8111-111111111111',
             '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333',
             '44444444-4444-4444-8444-444444444444',
             '55555555-5555-4555-8555-555555555555'
    )
ORDER BY username ASC;

SELECT
    f.id AS friendship_id,
    requester.username AS requester,
    addressee.username AS addressee,
    f.status,
    f.created_at
FROM friendships f
         JOIN users requester ON requester.id = f.requester_id
         JOIN users addressee ON addressee.id = f.addressee_id
WHERE requester.id IN (
                       '11111111-1111-4111-8111-111111111111',
                       '22222222-2222-4222-8222-222222222222',
                       '33333333-3333-4333-8333-333333333333',
                       '44444444-4444-4444-8444-444444444444',
                       '55555555-5555-4555-8555-555555555555'
    )
   OR addressee.id IN (
                       '11111111-1111-4111-8111-111111111111',
                       '22222222-2222-4222-8222-222222222222',
                       '33333333-3333-4333-8333-333333333333',
                       '44444444-4444-4444-8444-444444444444',
                       '55555555-5555-4555-8555-555555555555'
    )
ORDER BY f.created_at ASC;

SELECT
    sender.username AS sender,
    receiver.username AS receiver,
    m.content,
    m.status,
    m.read_at,
    m.created_at
FROM messages m
         JOIN users sender ON sender.id = m.sender_id
         JOIN users receiver ON receiver.id = m.receiver_id
WHERE sender.id IN (
                    '11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                    '33333333-3333-4333-8333-333333333333',
                    '44444444-4444-4444-8444-444444444444',
                    '55555555-5555-4555-8555-555555555555'
    )
   OR receiver.id IN (
                      '11111111-1111-4111-8111-111111111111',
                      '22222222-2222-4222-8222-222222222222',
                      '33333333-3333-4333-8333-333333333333',
                      '44444444-4444-4444-8444-444444444444',
                      '55555555-5555-4555-8555-555555555555'
    )
ORDER BY m.created_at ASC;