import { buildAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';

interface AttachmentMigrationTarget {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
}

export function migrateAttachmentIdsToHashes(sqlite: AttachmentMigrationTarget) {
  const attachmentColumns = sqlite
    .prepare('PRAGMA table_info(attachments)')
    .all() as Array<{ name: string }>;

  if (!attachmentColumns.some((column) => column.name === 'hash')) {
    return;
  }

  sqlite.exec('ALTER TABLE attachments RENAME TO attachments_legacy');
  sqlite.exec('ALTER TABLE node_attachments RENAME TO node_attachments_legacy');
  sqlite.exec(`CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    original_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT NOT NULL
  )`);
  sqlite.exec(`INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
    SELECT hash, original_name, mime_type, size_bytes, created_at
    FROM attachments_legacy`);
  sqlite.exec(`CREATE TABLE node_attachments (
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    attachment_id TEXT NOT NULL REFERENCES attachments(id),
    role TEXT NOT NULL,
    PRIMARY KEY (node_id, attachment_id, role)
  )`);
  sqlite.exec(`INSERT INTO node_attachments (node_id, attachment_id, role)
    SELECT legacy.node_id, attachments_legacy.hash, legacy.role
    FROM node_attachments_legacy legacy
    INNER JOIN attachments_legacy ON attachments_legacy.id = legacy.attachment_id`);
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_node_attachments_attachment_id ON node_attachments (attachment_id)');

  const legacyAttachments = sqlite
    .prepare('SELECT id, hash, original_name FROM attachments_legacy')
    .all() as Array<{ hash: string; id: string; original_name: string | null }>;

  const updateNodeContent = sqlite.prepare(
    `UPDATE nodes
     SET content = REPLACE(content, ?, ?)
     WHERE content LIKE ?`
  );

  for (const attachment of legacyAttachments) {
    const oldReference = `attachment://${attachment.id}`;
    const newReference = buildAssetMarkdownUrl(attachment.hash, attachment.original_name);
    updateNodeContent.run(oldReference, newReference, `%${oldReference}%`);
  }

  sqlite.exec('DROP TABLE node_attachments_legacy');
  sqlite.exec('DROP TABLE attachments_legacy');
}
