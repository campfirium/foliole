import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { isStoredVersionIdentical } from '../../../../../lib/core/sync/syncNodeGraph';
import type { NativeSyncNodeRecord } from '../../../../../lib/platform/nativeSyncContract';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

async function hasSavedDelivery(db: DbPort, key: string, fingerprint: string, record: NativeSyncNodeRecord) {
  const [receipt] = await db.query<{ value: string }>('SELECT value FROM companion_meta WHERE key = ?', [key]);
  if (receipt) {
    if (receipt.value !== fingerprint) throw new Error('share_delivery_collision');
    return true;
  }
  // An existing pending delivery can predate local receipts. Only an exact stored
  // version proves it was saved; an unrelated or edited topic is not sufficient.
  if (await isStoredVersionIdentical(db, record)) return true;
  const collisions = await db.query(
    `SELECT version_id AS id FROM node_sync_versions WHERE version_id = ?
     UNION ALL SELECT id FROM nodes WHERE id = ?
     UNION ALL SELECT node_id AS id FROM node_sync_tombstones WHERE node_id = ? LIMIT 1`,
    [record.version_id, record.object_id, record.object_id]
  );
  if (collisions.length > 0) throw new Error('share_delivery_collision');
  return false;
}

export async function persistCompanionShareDelivery(record: NativeSyncNodeRecord, inboxAvailable: boolean) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([
    record.snapshot.title, record.body_text
  ])));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const key = `share-delivery:${record.object_id}`;
  return runCompanionHighValueMutationTask(() => writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    if (!await hasSavedDelivery(tx, key, fingerprint, record)) {
      if (!inboxAvailable) throw new Error('share_inbox_unavailable');
      const result = await applySyncNodesWithDbPort(tx, [record], {
        enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation: 'local_mutation'
      });
      if (!result.appliedIds.includes(record.object_id) || result.conflictNodes.length > 0) {
        throw new Error('share_delivery_not_saved');
      }
    }
    // Keep the compact receipt after ack: Android can redeliver the same Intent,
    // and ordinary version collection can remove the original version identity.
    await tx.run(`INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO NOTHING`, [key, fingerprint, record.updated_at]);
  })));
}
