-- keyspace: chat_app
CREATE KEYSPACE IF NOT EXISTS chat_app
WITH REPLICATION = {'class':'SimpleStrategy', 'replication_factor':1};

USE chat_app;

-- messages table
CREATE TABLE IF NOT EXISTS messages (
    chat_id UUID,
    message_id TIMEUUID,
    sender_id BIGINT,
    content TEXT,
    created_at TIMESTAMP,
    PRIMARY KEY (chat_id, message_id)
) WITH CLUSTERING ORDER BY (message_id ASC);

ALTER TABLE messages ADD parent_msg_id uuid;