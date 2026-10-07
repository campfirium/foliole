import { adoptVerifiedBody, stageBodyContent } from '../sync/bodyContentWrite.js';
import type { DbPort } from '../sync/dbPort.js';

import { bodyMigrationSourceChunks, bodyMigrationSourceHash } from './bodyContentMigrationSource.js';

const OWNERS = [
  { kind: 'tombstone', table: 'node_sync_tombstones', text: "CASE WHEN json_type(snapshot_json, '$.content') = 'text' THEN json_extract(snapshot_json, '$.content') END",
    column: 'inline_body_hash', timestamp: 'created_at', clear: "snapshot_json = json_set(snapshot_json, '$.content', NULL)", json: true },
  { kind: 'conflict', table: 'node_sync_conflicts', text: "CASE WHEN json_type(snapshot_json, '$.content') = 'text' THEN json_extract(snapshot_json, '$.content') END",
    column: 'inline_body_hash', timestamp: 'detected_at', clear: "snapshot_json = json_set(snapshot_json, '$.content', NULL)", json: true },
  { kind: 'alternative', table: 'node_text_alternatives', text: 'body_text', column: 'body_blob_hash', timestamp: 'updated_at', clear: "body_text = ''", json: false },
  { kind: 'external', table: 'external_documents', text: 'content', column: 'body_blob_hash', timestamp: 'updated_at', clear: "content = ''", json: false },
  { kind: 'incoming', table: 'incoming_updates', text: 'updated_content', column: 'body_blob_hash', timestamp: 'updated_at', clear: "updated_content = ''", json: false },
  { kind: 'import_cache', table: 'keep_import_item_cache', text: 'content', column: 'body_blob_hash', timestamp: 'refreshed_at', clear: 'content = NULL', json: false }
] as const;

/** Caller owns the upgrade transaction. Scope is explicit, never inferred from missing schema. */
export async function migrateBodyContentOwners(db: DbPort, scope: 'desktop' | 'companion') {
  for (const owner of OWNERS) {
    if (scope === 'companion' && (owner.kind === 'incoming' || owner.kind === 'import_cache')) continue;
    if (owner.kind !== 'external') await db.run(`ALTER TABLE ${owner.table} ADD COLUMN ${owner.column} TEXT`);
    await migrateOwnerRows(db, owner);
  }
}

async function migrateOwnerRows(db: DbPort, owner: typeof OWNERS[number]) {
  let after = 0;
  for (;;) {
    const [row] = await db.query<{ rowid: number; size: number; body_hash: string | null; timestamp: string }>(
      `SELECT rowid, length(CAST(${owner.text} AS BLOB)) AS size, ${owner.column} AS body_hash,
        ${owner.timestamp} AS timestamp FROM ${owner.table}
        WHERE rowid > ? AND ${owner.text} IS NOT NULL ORDER BY rowid LIMIT 1`, [after]);
    if (!row) return;
    after = row.rowid;
    // An external hashed body already owns the complete bytes; its empty inline field is a projection.
    if (owner.kind === 'external' && row.body_hash && row.size === 0) continue;
    const source = { kind: owner.kind, rowid: row.rowid };
    const hash = await bodyMigrationSourceHash(db, source, row.size);
    if (row.body_hash && row.body_hash !== hash) throw new Error('body_migration_owner_hash_mismatch');
    const ref = await stageBodyContent(db, { hash, byteLength: row.size,
      chunks: bodyMigrationSourceChunks(db, source, row.size) });
    await adoptVerifiedBody(db, ref, row.timestamp);
    await db.run(`UPDATE ${owner.table} SET ${owner.column} = ?, ${owner.clear} WHERE rowid = ?`, [hash, row.rowid]);
  }
}
