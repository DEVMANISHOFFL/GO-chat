CREATE TABLE refresh_tokens (
    user_id UUID,
    refresh_id TIMEUUID,
    token TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP,
    PRIMARY KEY (user_id, refresh_id)
) WITH CLUSTERING ORDER BY (refresh_id DESC);