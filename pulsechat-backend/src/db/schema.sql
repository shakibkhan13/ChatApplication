CREATE EXTENSION IF NOT EXISTS pgcrypto; 

CREATE TABLE users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    email TEXT NOT NULL UNIQUE, 
    name TEXT NOT NULL, 
    avater_url TEXT, 
    password_hash TEXT NOT NULL, 
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
); 

CREATE TABLE refresh_sessions(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, 
    token_hash TEXT NOT NULL UNIQUE, 
    expires_at TIMESTAMPTZ NOT NULL, 
    revoked_at TIMESTAMPTZ, 
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() 
); 

CREATE INDEX idx_refresh_sessions_user
  ON refresh_sessions(user_id);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  title TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  last_message_id BIGINT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_members (
  conversation_id UUID NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_members_user
  ON conversation_members(user_id, conversation_id);

CREATE TABLE messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id UUID NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  client_msg_id UUID NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text'
    CHECK (type IN ('text', 'image', 'file')),
  reply_to_id BIGINT REFERENCES messages(id),
  attachment_url TEXT,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (conversation_id, sender_id, client_msg_id)
);

ALTER TABLE conversations
  ADD CONSTRAINT fk_last_message
  FOREIGN KEY (last_message_id) REFERENCES messages(id)
  ON DELETE SET NULL;

ALTER TABLE conversation_members
  ADD CONSTRAINT fk_last_read_message
  FOREIGN KEY (last_read_message_id) REFERENCES messages(id)
  ON DELETE SET NULL;

CREATE INDEX idx_messages_conv_id_desc
  ON messages(conversation_id, id DESC);

CREATE INDEX idx_messages_sender
  ON messages(sender_id, id DESC);

CREATE TABLE message_reactions (
  message_id BIGINT NOT NULL
    REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);