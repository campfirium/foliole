// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../database/framedSyncStagingSchema.js';

import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from './framedSyncContract.js';
import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { createFramedSyncOutboundStaging, publishFramedSyncOutboundWithDbPort } from './framedSyncOutboundStaging.js';
import { completeFramedSyncRecoveredPublication, selectFramedSyncRecoveryPublication } from './framedSyncPublicationRecoverySelection.js';
import { projectFramedSyncResourceFact } from './framedSyncResourceFact.js';

let sqlite: Database.Database | undefined;
let root = '';
afterEach(async () => {
  sqlite?.close();
  sqlite = undefined;
  if (root) await rm(root, { recursive: true, force: true });
});
const digest = (value: number) => new Uint8Array(32).fill(value);

it('recovers the frozen missing attachment after reopening SQLite and retains its owner until delivery', async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-resource-recovery-'));
  const databasePath = path.join(root, 'library.sqlite');
  sqlite = new Database(databasePath);
  for (const statement of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(statement);
  let db = createBetterSqliteDbPort(sqlite);
  const binding = { demandId: 'demand-1', globalId: 'article', versionId: 'adopted-version',
    bodyHash: 'a'.repeat(64), sharedStateHash: digest(3) };
  const facts = [1, 2].map((value) => {
    const hash = Buffer.from(digest(value)).toString('hex');
    return projectFramedSyncResourceFact(binding,
      { contentHash: hash, storageKey: `${hash}.png`, role: 2 }, BigInt(value * 17));
  });
  const manifest = { facts, blobs: facts.flatMap((fact) => fact.blobs) };
  const source: FramedSyncInventoryEntry = { globalId: binding.globalId, objectType: 'node',
    frontierFactIds: [binding.versionId], requiredRelationIds: [], reviewFactIds: [],
    resourceHashes: [digest(1), digest(2)], sharedStateHash: binding.sharedStateHash };
  const context: FramedSyncContext = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: 'A', senderLibraryEpoch: 'a', receiverDeviceId: 'B', receiverLibraryEpoch: 'b' };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  const inventoryDifference = compareFramedSyncInventories({ local: [source],
    remote: [{ ...source, resourceHashes: [] }] })[0]!;
  await db.transaction((tx) => publishFramedSyncOutboundWithDbPort(tx,
    { context, contentId, transferId, manifest, manifestHash: contentId, inventoryDifference }));
  sqlite.close();
  sqlite = new Database(databasePath);
  db = createBetterSqliteDbPort(sqlite);

  const recovered = await selectFramedSyncRecoveryPublication(db, transferId,
    [{ ...source, resourceHashes: [digest(1)] }]);
  expect(recovered.manifest).toEqual({ facts: [facts[1]], blobs: facts[1]!.blobs });
  expect(recovered.transferId).not.toEqual(transferId);
  expect((await createFramedSyncOutboundStaging(db).loadOutboundPublication(transferId))?.manifest)
    .toEqual(manifest);
  expect(sqlite.prepare('SELECT member_id FROM framed_sync_outbound_holds').all())
    .toEqual([{ member_id: 'B' }, { member_id: 'B' }]);
  await expect(completeFramedSyncRecoveredPublication(db, transferId, recovered.transferId))
    .rejects.toThrow('framed_sync_recovery_delivery_unconfirmed');
  expect(sqlite.prepare('SELECT state FROM framed_sync_outbound_publications WHERE transfer_id = ?')
    .get(transferId)).toEqual({ state: 'published' });
  // Delivery confirmation is the downstream precondition; this test does not validate attachment receipt transport.
  await db.run("UPDATE framed_sync_outbound_publications SET state = 'receipt_committed' WHERE transfer_id = ?",
    [recovered.transferId]);
  await completeFramedSyncRecoveredPublication(db, transferId, recovered.transferId);
  expect(sqlite.prepare('SELECT member_id FROM framed_sync_outbound_holds WHERE transfer_id = ?')
    .all(transferId)).toEqual([]);
});
