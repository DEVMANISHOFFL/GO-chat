-- Create keyspace
CREATE KEYSPACE IF NOT EXISTS chat_app
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE chat_app;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username TEXT,
    email TEXT,
    password TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- For fast lookup by username/email
CREATE TABLE IF NOT EXISTS users_by_username (
    username TEXT PRIMARY KEY,
    user_id UUID
);

CREATE TABLE IF NOT EXISTS users_by_email (
    email TEXT PRIMARY KEY,
    user_id UUID
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    user_id UUID,
    refresh_id UUID,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP,
    PRIMARY KEY (user_id, refresh_id)
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
    room_id UUID PRIMARY KEY,
    name TEXT,
    created_by UUID,
    created_at TIMESTAMP,
    slug TEXT
);

-- Messages in rooms
CREATE TABLE IF NOT EXISTS room_messages (
    room_id UUID,
    msg_id UUID,
    user_id UUID,
    content TEXT,
    created_at TIMESTAMP,
    edited_at TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by UUID,
    deleted_reason TEXT,
    parent_id UUID,
    PRIMARY KEY (room_id, msg_id)
) WITH CLUSTERING ORDER BY (msg_id DESC);

-- Room participants
CREATE TABLE IF NOT EXISTS room_participants (
    room_id UUID,
    user_id UUID,
    member_role TEXT,
    joined_at TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);

-- Direct Message threads
CREATE TABLE IF NOT EXISTS dm_threads (
    user_a UUID,
    user_b UUID,
    room_id UUID,
    created_at TIMESTAMP,
    PRIMARY KEY (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS chat_app.messages (
    room_id UUID,
    msg_id UUID,
    user_id UUID,
    content TEXT,
    created_at TIMESTAMP,
    parent_id UUID,
    PRIMARY KEY (room_id, msg_id)
);
