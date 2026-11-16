import Database from 'better-sqlite3';

import { FRAMED_SYNC_INVENTORY_TRIGGERS } from '../../lib/core/database/framedSyncInventorySchema.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { encodeFramedSyncManifest } from '../../lib/core/database/framedSyncStagingSerialization.js';
import { migrateNodeHistoryState } from '../../lib/core/database/nodeHistoryStateMigration.js';
import { PARENT_CHILD_ORDER_SCHEMA_SQL } from '../../lib/core/database/numberedMigrationParentChildOrder.js';
import { readParentChildOrder, ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { canonicalContentId, canonicalTransferIdSync, type CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { selectFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

/** Seeds a historical mixed publication from exact current business facts in this temporary library. */
export async function freezeLegacyOrderPublication(file: string) {
  const db = new Database(file);
  try {
    const port = createBetterSqliteDbPort(db);
    const node = await loadCurrentSyncNodeRecord(port, 'original');
    const key = { objectType: 'parent_child_order' as const, globalId: 'parent-child-order:root' };
    const order = await readFramedSyncInventoryEntry(port, key);
    if (!node || !order?.stateFactIds?.[0]) throw new Error('mixed_fixture_required');
    const projected = projectFramedSyncNodeRecord(node).manifest;
    const manifest: CanonicalManifest = { blobs: projected.blobs,
      facts: [...projected.facts, await selectFramedSyncObjectStateFact(port, key, order.stateFactIds[0])] };
    for (const sql of FRAMED_SYNC_STAGING_SCHEMA) db.exec(sql);
    if (!manifest.facts.some(fact => fact.objectType === 'node') ||
        !manifest.facts.some(fact => fact.objectType === 'parent_child_order')) throw new Error('mixed_fixture_required');
    const contentId = await canonicalContentId(manifest);
    const transferId = canonicalTransferIdSync({ protocolVersion: 22, groupId: 't326-group',
      senderDeviceId: 'desktop-a', senderLibraryEpoch: 'desktop-a-epoch',
      receiverDeviceId: 'desktop-b', receiverLibraryEpoch: 'desktop-b-epoch' }, contentId);
    await createBetterSqliteDbPort(db).transaction(async tx => {
      await tx.run('DELETE FROM framed_sync_outbound_publications');
      await tx.run(`INSERT INTO framed_sync_outbound_publications
        (transfer_id, content_id, manifest_hash, canonical_manifest, manifest_json, protocol_version,
          group_id, sender_device_id, sender_library_epoch, receiver_device_id, receiver_library_epoch,
          fact_count, blob_count, total_blob_bytes, state)
        VALUES (?, ?, ?, ?, ?, 22, 't326-group', 'desktop-a', 'desktop-a-epoch',
          'desktop-b', 'desktop-b-epoch', ?, ?, ?, 'published')`,
      [transferId, contentId, contentId, new Uint8Array(), encodeFramedSyncManifest(manifest),
        manifest.facts.length, manifest.blobs.length, manifest.blobs.reduce((sum, blob) => sum + blob.byteLength, 0n)]);
      for (const fact of manifest.facts) await tx.run('INSERT INTO framed_sync_outbound_fact_refs VALUES (?, ?, ?, ?, ?)',
        [transferId, fact.kind, fact.objectType, fact.globalId, fact.factId]);
      for (const blob of manifest.blobs) await tx.run('INSERT INTO framed_sync_outbound_blob_refs VALUES (?, ?, ?, ?, ?)',
        [transferId, blob.sha256, blob.byteLength, blob.role, blob.required ? 1 : 0]);
      await tx.run("INSERT INTO framed_sync_outbound_holds VALUES (?, 'desktop-b')", [transferId]);
      for (const sql of FRAMED_SYNC_INVENTORY_TRIGGERS) {
        await tx.run(`DROP TRIGGER IF EXISTS ${/^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)![1]}`);
      }
      migrateNodeHistoryState(db);
      db.exec(PARENT_CHILD_ORDER_SCHEMA_SQL);
      const driver = createBetterSqlite3Driver(db);
      const parents = db.prepare<[], { parent_id: string }>('SELECT DISTINCT parent_id FROM parent_order_sources').all();
      for (const { parent_id: parentId } of parents) {
        const { childIds } = readParentChildOrder(driver, parentId === ROOT_CHILD_ORDER_ID ? null : parentId);
        await tx.run('INSERT INTO parent_child_order VALUES (?, ?, ?)', [parentId, JSON.stringify(childIds), '2026-01-01']);
      }
      for (const name of ['insert', 'update', 'delete']) await tx.run(`DROP TRIGGER IF EXISTS trg_parent_order_node_${name}`);
      for (const table of ['parent_order_sources', 'parent_order_writer', 'parent_order_projection_pending']) {
        await tx.run(`DROP TABLE IF EXISTS ${table}`);
      }
      await tx.run('ALTER TABLE framed_sync_outbound_publications DROP COLUMN retirement_reason');
      await tx.run('PRAGMA user_version = 151');
    });
    return transferId;
  } finally { db.close(); }
}
