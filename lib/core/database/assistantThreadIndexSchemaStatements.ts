export const ASSISTANT_THREAD_INDEX_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS assistant_thread_index (
    provider TEXT NOT NULL,
    provider_thread_id TEXT NOT NULL,
    agent_tool_version INTEGER NOT NULL DEFAULT 0,
    continued_from_thread_id TEXT,
    location_type TEXT NOT NULL,
    location_node_id TEXT,
    title TEXT NOT NULL,
    preview TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    read_state TEXT NOT NULL DEFAULT 'not_requested',
    read_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT NOT NULL,
    archived_at TEXT,
    deleted_at TEXT,
    PRIMARY KEY (provider, provider_thread_id),
    CHECK (location_type IN ('node', 'workspace')),
    CHECK (status IN ('active', 'archived', 'deleted')),
    CHECK (read_state IN ('not_requested', 'available', 'failed')),
    CHECK (agent_tool_version >= 0),
    CHECK (location_type != 'node' OR location_node_id IS NOT NULL),
    CHECK (location_type != 'workspace' OR location_node_id IS NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_thread_index_location
    ON assistant_thread_index (location_type, location_node_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_thread_index_status_updated
    ON assistant_thread_index (status, updated_at)`
];

export const ASSISTANT_THREAD_MESSAGE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS assistant_thread_messages (
    provider TEXT NOT NULL,
    provider_thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (provider, provider_thread_id, message_id),
    FOREIGN KEY (provider, provider_thread_id)
      REFERENCES assistant_thread_index(provider, provider_thread_id)
      ON DELETE CASCADE,
    CHECK (role IN ('assistant', 'user'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_thread_messages_thread_created
    ON assistant_thread_messages (provider, provider_thread_id, created_at, message_id)`
];

export const ASSISTANT_IMAGE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS assistant_image_attachments (
    attachment_id TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
    CHECK (size_bytes > 0)
  )`,
  `CREATE TABLE IF NOT EXISTS assistant_thread_message_images (
    provider TEXT NOT NULL,
    provider_thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    attachment_id TEXT NOT NULL,
    PRIMARY KEY (provider, provider_thread_id, message_id, position),
    UNIQUE (provider, provider_thread_id, message_id, attachment_id),
    FOREIGN KEY (provider, provider_thread_id, message_id)
      REFERENCES assistant_thread_messages(provider, provider_thread_id, message_id)
      ON DELETE CASCADE,
    FOREIGN KEY (attachment_id)
      REFERENCES assistant_image_attachments(attachment_id)
      ON DELETE RESTRICT,
    CHECK (position >= 0)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_message_images_attachment
    ON assistant_thread_message_images (attachment_id)`
];

export const ASSISTANT_THREAD_SCHEMA_STATEMENTS = [
  ...ASSISTANT_THREAD_INDEX_SCHEMA_STATEMENTS,
  ...ASSISTANT_THREAD_MESSAGE_SCHEMA_STATEMENTS,
  ...ASSISTANT_IMAGE_SCHEMA_STATEMENTS
];
