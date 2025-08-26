-- 001_reactions.cql

-- Uniqueness & who-reacted list:
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id uuid,
  emoji text,
  user_id uuid,
  created_at timeuuid,
  PRIMARY KEY ((message_id, emoji), user_id)
) WITH CLUSTERING ORDER BY (user_id ASC);

-- Counter table for fast counts:
CREATE TABLE IF NOT EXISTS reaction_counts (
  message_id uuid,
  emoji text,
  count counter,
  PRIMARY KEY ((message_id), emoji)
);
