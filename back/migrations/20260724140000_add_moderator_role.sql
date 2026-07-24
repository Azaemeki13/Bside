ALTER TABLE users
    ADD CONSTRAINT chk_users_role CHECK (role IN ('Admin', 'Moderator', 'User'));
