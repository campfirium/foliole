import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { framedSyncNodeInventorySql, framedSyncTombstoneSummarySql,
  framedSyncVersionSummarySql } from './framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TABLES, FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

/** Initialize once in the numbered migration transaction, never during discovery. */
export function migrateFramedSyncInventory(sqlite: DatabaseMigrationTarget) {
  for (const statement of FRAMED_SYNC_INVENTORY_TABLES) sqlite.exec(statement);
  sqlite.exec(framedSyncVersionSummarySql('1'));
  const query = sqlite.prepare(`SELECT version_id, body_text FROM node_sync_versions
    WHERE body_text IS NOT NULL AND version_id > ? ORDER BY version_id LIMIT 1`);
  const update = sqlite.prepare('UPDATE framed_sync_version_summary SET body_hash = ? WHERE version_id = ?');
  let after = '';
  for (;;) {
    const row = query.all(after)[0];
    if (!row) break;
    if (typeof row !== 'object' || !('version_id' in row) || !('body_text' in row) ||
        typeof row.version_id !== 'string' || typeof row.body_text !== 'string') {
      throw new Error('framed_sync_inventory_migration_version_invalid');
    }
    update.run(bytesToHex(sha256(new TextEncoder().encode(row.body_text))), row.version_id);
    after = row.version_id;
  }
  sqlite.exec(framedSyncTombstoneSummarySql('1'));
  sqlite.exec(`INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
    SELECT 3, json_array(parent.version_id, parent.parent_version_id, parent.ordinal), version.object_id
      FROM node_sync_version_parents parent JOIN framed_sync_version_summary version
        ON version.version_id = parent.version_id;
    INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
      SELECT 4, op_id, node_id FROM review_log;`);
  sqlite.exec(framedSyncNodeInventorySql("SELECT object_id FROM sync_object_state WHERE object_type = 'node'"));
  for (const statement of FRAMED_SYNC_INVENTORY_TRIGGERS) sqlite.exec(statement);
}

export async function migrateCompanionFramedSyncInventory(port: import('../sync/dbPort.js').DbPort) {
  for (const sql of FRAMED_SYNC_INVENTORY_TABLES) await port.run(sql);
  await port.run(framedSyncVersionSummarySql('1'));
  let after = '';
  for (;;) {
    const rows = await port.query<{ version_id: string; body_text: string }>(
      `SELECT version_id, body_text FROM node_sync_versions
       WHERE body_text IS NOT NULL AND version_id > ? ORDER BY version_id LIMIT 1`, [after]);
    for (const row of rows) await port.run(
      'UPDATE framed_sync_version_summary SET body_hash = ? WHERE version_id = ?',
      [bytesToHex(sha256(new TextEncoder().encode(row.body_text))), row.version_id]);
    if (!rows.length) break;
    after = rows.at(-1)!.version_id;
  }
  await port.run(framedSyncTombstoneSummarySql('1'));
  await port.run(`INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
    SELECT 3, json_array(parent.version_id, parent.parent_version_id, parent.ordinal), version.object_id
    FROM node_sync_version_parents parent JOIN framed_sync_version_summary version
      ON version.version_id = parent.version_id`);
  await port.run(`INSERT OR REPLACE INTO framed_sync_fact_summary (kind, fact_id, object_id)
    SELECT 4, op_id, node_id FROM review_log`);
  for (const sql of framedSyncNodeInventorySql(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'node'").split(';').filter((sql) => sql.trim())) {
    await port.run(sql);
  }
  for (const sql of FRAMED_SYNC_INVENTORY_TRIGGERS) await port.run(sql);
}
