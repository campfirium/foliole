import type { DbPort } from '../sync/dbPort.js';

import { framedSyncNodeInventorySql, framedSyncTombstoneSummarySql, framedSyncVersionSummarySql } from './framedSyncInventoryProjectionSql.js';
import { createFramedSyncInventoryTriggers } from './framedSyncInventorySchema.js';

/** Part of the formal body upgrade transaction, after stable body and owner migration. */
export async function migrateVerifiedBodyInventory(db: DbPort) {
  const triggers = createFramedSyncInventoryTriggers('chunked');
  for (const sql of triggers) {
    const name = /^CREATE TRIGGER IF NOT EXISTS (trg_framed_inventory_[a-z_]+)/u.exec(sql)?.[1];
    if (!name) throw new Error('framed_sync_inventory_trigger_invalid');
    await db.run(`DROP TRIGGER IF EXISTS ${name}`);
  }
  await db.run('DELETE FROM framed_sync_version_summary');
  await db.run(framedSyncVersionSummarySql('1', 'chunked'));
  await db.run(framedSyncTombstoneSummarySql('1', 'chunked'));
  for (const sql of framedSyncNodeInventorySql(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'node'").split(';').filter((sql) => sql.trim())) {
    await db.run(sql);
  }
  for (const sql of triggers) await db.run(sql);
}
