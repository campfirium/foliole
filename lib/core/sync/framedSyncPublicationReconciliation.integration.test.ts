// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../database/framedSyncStagingSchema.js';

import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { publishFramedSyncOutboundWithDbPort } from './framedSyncOutboundStaging.js';
import { reconcileFramedSyncPublication } from './framedSyncPublicationReconciliation.js';
import { completeFramedSyncRecoveredPublication, selectFramedSyncRecoveryPublication } from './framedSyncPublicationRecoverySelection.js';

let sqlite: Database.Database;
afterEach(() => sqlite?.close());
const hash = new Uint8Array(32).fill(1);
const source: FramedSyncInventoryEntry = { globalId: 'n', objectType: 'node',
  currentVersionId: 'b', frontierFactIds: ['a', 'b'], requiredRelationIds: [], reviewFactIds: [],
  resourceHashes: [], stateFactIds: [], sharedStateHash: hash };

async function publish() {
  sqlite = new Database(':memory:');
  for (const statement of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(statement);
  const db = createBetterSqliteDbPort(sqlite);
  const context = { protocolVersion: 22 as const, groupId: 'g', senderDeviceId: 'A',
    senderLibraryEpoch: 'a', receiverDeviceId: 'B', receiverLibraryEpoch: 'b' };
  const manifest = { blobs: [], facts: ['a', 'b'].map((factId) => ({ factId, blobs: [],
    body: [], kind: 2, objectType: 'node', globalId: 'n', sharedStateHash: hash })) };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  const inventoryDifference = compareFramedSyncInventories({ local: [source],
    remote: [{ ...source, frontierFactIds: [], sharedStateHash: new Uint8Array(32).fill(2) }] })[0]!;
  await publishFramedSyncOutboundWithDbPort(db, { context, contentId, transferId,
    manifest, manifestHash: contentId, inventoryDifference });
  return { db, transferId };
}

it('writes off present input atomically without inventing a receiver receipt', async () => {
  const { db, transferId } = await publish();
  expect(await reconcileFramedSyncPublication(db, transferId, [source])).toBe('satisfied');
  expect(sqlite.prepare('SELECT state FROM framed_sync_outbound_publications').get())
    .toEqual({ state: 'receipt_committed' });
  expect(sqlite.prepare('SELECT * FROM framed_sync_outbound_holds').all()).toEqual([]);
  expect(sqlite.prepare('SELECT * FROM framed_sync_receipts').all()).toEqual([]);
});

it('transmits only the missing subset and protects the original until durable completion', async () => {
  const { db, transferId } = await publish();
  const remote = [{ ...source, frontierFactIds: ['a'], sharedStateHash: new Uint8Array(32).fill(2) }];
  expect(await reconcileFramedSyncPublication(db, transferId, remote)).toBe('missing');
  const recovered = await selectFramedSyncRecoveryPublication(db, transferId, remote);
  expect(recovered.manifest.facts.map((fact) => fact.factId)).toEqual(['b']);
  expect(recovered.transferId).not.toEqual(transferId);
  await expect(completeFramedSyncRecoveredPublication(db, transferId, recovered.transferId))
    .rejects.toThrow('framed_sync_recovery_delivery_unconfirmed');
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_holds').get())
    .toEqual({ count: 2 });
  await db.run("UPDATE framed_sync_outbound_publications SET state = 'receipt_committed' WHERE transfer_id = ?",
    [recovered.transferId]);
  await completeFramedSyncRecoveredPublication(db, transferId, recovered.transferId);
  expect(sqlite.prepare('SELECT state FROM framed_sync_outbound_publications WHERE transfer_id = ?')
    .get(transferId)).toEqual({ state: 'receipt_committed' });
});

it('keeps pending work on invalid comparison and does not release another receiver', async () => {
  const { db, transferId } = await publish();
  await expect(reconcileFramedSyncPublication(db, transferId, [source, source])).rejects.toThrow();
  expect(sqlite.prepare('SELECT state FROM framed_sync_outbound_publications').get())
    .toEqual({ state: 'published' });
  expect(sqlite.prepare('SELECT member_id FROM framed_sync_outbound_holds').all())
    .toEqual([{ member_id: 'B' }]);
});
