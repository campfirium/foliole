import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

const clock = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const enqueue = (id: string) => `INSERT INTO attachment_parse_queue(article_id, registered_at)
  VALUES (${id}, ${clock}) ON CONFLICT(article_id) DO NOTHING;`;

export const ATTACHMENT_DEMAND_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS attachment_parse_queue (
    article_id TEXT PRIMARY KEY, registered_at TEXT NOT NULL, attempted_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS attachment_parse_order ON attachment_parse_queue
    (COALESCE(attempted_at, registered_at), article_id)`,
  `CREATE TABLE IF NOT EXISTS attachment_pending (
    article_id TEXT NOT NULL, storage_key TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('mount', 'body')),
    registered_at TEXT NOT NULL, attempted_at TEXT, PRIMARY KEY(article_id, source, storage_key))`,
  `CREATE INDEX IF NOT EXISTS attachment_pending_order ON attachment_pending(attempted_at, registered_at, article_id, source, storage_key)`,
  `CREATE INDEX IF NOT EXISTS attachment_pending_key ON attachment_pending(storage_key)`,
  `CREATE TRIGGER IF NOT EXISTS attachment_demand_insert AFTER INSERT ON nodes
    BEGIN ${enqueue('NEW.id')} END`,
  `CREATE TRIGGER IF NOT EXISTS attachment_demand_update
    AFTER UPDATE OF content, body_blob_hash, resource_references, deleted_at ON nodes
    WHEN OLD.content IS NOT NEW.content OR OLD.body_blob_hash IS NOT NEW.body_blob_hash
      OR OLD.resource_references IS NOT NEW.resource_references OR OLD.deleted_at IS NOT NEW.deleted_at
    BEGIN ${enqueue('NEW.id')} END`,
  `CREATE TRIGGER IF NOT EXISTS attachment_demand_delete AFTER DELETE ON nodes
    BEGIN ${enqueue('OLD.id')} END`
];

export const SEED_ATTACHMENT_PARSE_QUEUE = `INSERT INTO attachment_parse_queue(article_id, registered_at)
  SELECT id, ${clock} FROM nodes WHERE deleted_at IS NULL
  ON CONFLICT(article_id) DO NOTHING`;

export function migrateAttachmentDemands(db: DatabaseMigrationTarget) {
  for (const sql of ATTACHMENT_DEMAND_SCHEMA) db.exec(sql);
  db.exec(SEED_ATTACHMENT_PARSE_QUEUE);
}

export async function migrateCompanionAttachmentDemands(db: DbPort) {
  for (const sql of ATTACHMENT_DEMAND_SCHEMA) await db.run(sql);
  await db.run(SEED_ATTACHMENT_PARSE_QUEUE);
}
