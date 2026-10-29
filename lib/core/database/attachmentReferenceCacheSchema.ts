import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { hashTextBody } from './textBodyHash.js';

export const ATTACHMENT_REFERENCE_CACHE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS attachment_reference_cache (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    body_hash TEXT, resources_json TEXT NOT NULL, storage_keys_json TEXT NOT NULL
  )`
];

const missingBodies = `SELECT id, content FROM nodes
  WHERE body_blob_hash IS NULL AND content <> '' ORDER BY id LIMIT 128`;

/** The numbered upgrade fills only absent derived identities; content and versions stay owned by nodes. */
export function migrateAttachmentReferenceCache(db: DatabaseMigrationTarget) {
  for (const sql of ATTACHMENT_REFERENCE_CACHE_SCHEMA) db.exec(sql);
  for (;;) {
    const rows = db.prepare(missingBodies).all() as Array<{ id: string; content: string }>;
    if (!rows.length) return;
    for (const row of rows) db.prepare('UPDATE nodes SET body_blob_hash = ? WHERE id = ? AND body_blob_hash IS NULL')
      .run(hashTextBody(row.content), row.id);
  }
}

export async function migrateCompanionAttachmentReferenceCache(db: DbPort) {
  for (const sql of ATTACHMENT_REFERENCE_CACHE_SCHEMA) await db.run(sql);
  for (;;) {
    const rows = await db.query<{ id: string; content: string }>(missingBodies);
    if (!rows.length) return;
    for (const row of rows) await db.run('UPDATE nodes SET body_blob_hash = ? WHERE id = ? AND body_blob_hash IS NULL',
      [hashTextBody(row.content), row.id]);
  }
}
