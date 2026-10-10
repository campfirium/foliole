// @vitest-environment node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import Database from 'better-sqlite3';
import { it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { readFramedSyncInventory, readFramedSyncOverwriteInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { pendingFramedSyncOverwriteDifferences } from '../../lib/core/sync/framedSyncOverwriteCompletion.js';
import { finishSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { finishSyncGroupOverwriteProgress } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';
import { applyVerifiedCompanionFramedSyncTransfers } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncVerifiedApply.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import { openCompanionAdoptionFixture } from './companionFramedSyncGroupAdoption.testSupport.js';
import { synchronizeDesktopFramedSync } from './desktopFramedSyncProcessOutbound.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

type Receiver = Awaited<ReturnType<typeof openCompanionAdoptionFixture>>;
type Context = Parameters<typeof readFramedSyncOverwriteInventory>[1];
type Source = Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>['leftSnapshot'];

async function differences(receiver: Receiver, context: Context) {
  const remote = await receiver.inventory();
  const local = await readFramedSyncOverwriteInventory(receiver.db, context);
  return { remote, differences: compareFramedSyncDatabaseInventories({ local, remote: remote.remote }) };
}

async function receiveOriginal(receiver: Receiver, context: Context) {
  const initial = await receiver.inventory();
  for (const difference of initial.differences) await receiver.stage(initial, difference);
  const prepared = await receiver.prepare();
  for (const unit of prepared) await applyVerifiedCompanionFramedSyncTransfers(receiver.db, [unit.input]);
  assert.equal((await differences(receiver, context)).differences.filter(d => d.direction === 'remote_to_local').length, 0);
  return prepared.find(p => p.decoded.globalId === 'topic')!.input.transferId;
}

async function saveEdit(receiver: Receiver) {
  const parent = (await loadCurrentSyncNodeRecord(receiver.db, 'topic'))!;
  assert.equal(parent.body_text, 'Original body');
  const time = '2026-10-09T00:00:00.000Z';
  const edit = { ...parent, ancestor_version_ids: [parent.version_id!, ...parent.ancestor_version_ids],
    version_id: 'phone-saved-edit', parent_version_id: parent.version_id, parent_version_ids: [parent.version_id!],
    content_hash: hashText('phone-saved-edit\nEdited body'), host_name: 'Phone', body_text: 'Edited body',
    updated_at: time, version_created_at: time, snapshot: { ...parent.snapshot,
      title: 'Edited', content: 'Edited body', body_blob_hash: null, updated_at: time,
      text_selection: { version_id: 'phone-saved-edit', created_at: time } } };
  await applySyncNodesWithDbPort(receiver.db, [edit], { operation: 'local_mutation', enqueueSearchInvalidations: false });
}

async function retryOriginal(receiver: Receiver, context: Context, transferId: Uint8Array) {
  const before = await differences(receiver, context);
  const requested = before.differences.filter(d => d.direction === 'remote_to_local');
  assert.equal(requested.length, 1);
  const receiptsBefore = receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get();
  await receiver.stage(before.remote, requested[0]!);
  const repeated = (await receiver.prepare()).find(p => p.decoded.globalId === 'topic')!;
  assert.deepEqual(repeated.input.transferId, transferId);
  const [receipt] = await applyVerifiedCompanionFramedSyncTransfers(receiver.db, [repeated.input]);
  assert.ok(receipt);
  const after = await differences(receiver, context);
  assert.equal((await loadCurrentSyncNodeRecord(receiver.db, 'topic'))!.body_text, 'Edited body');
  assert.equal(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get(), receiptsBefore);
  assert.equal(after.differences.filter(d => d.direction === 'remote_to_local').length, 1);
  assert.ok(await loadSyncGroupLocalAdoption(receiver.db));
  assert.deepEqual(await readFramedSyncInventory(receiver.db), []);
  return { after, requested };
}

async function finishAndReturnEdit(receiver: Receiver, context: Context, sourceSnapshot: Source,
  progress: Parameters<typeof prepareSyncGroupOverwrite>[1],
  { after, requested }: Awaited<ReturnType<typeof retryOriginal>>) {
  const pending = pendingFramedSyncOverwriteDifferences({
    local: await readFramedSyncOverwriteInventory(receiver.db, context), remote: after.remote.remote,
    deliveredDifferences: requested });
  assert.equal(pending.length, 0);
  await receiver.db.transaction(async tx => {
    await finishSyncGroupOverwriteProgress(tx, progress);
    await finishSyncGroupLocalAdoption(tx, receiver.adoption);
  });
  assert.equal(await loadSyncGroupLocalAdoption(receiver.db), null);
  assert.ok((await readFramedSyncInventory(receiver.db)).some(entry => entry.globalId === 'topic'));
  await synchronizeDesktopFramedSync({ db: receiver.db, groupId: progress.groupId,
    groupSecret: Buffer.from(new Uint8Array(32).fill(7)).toString('base64url'),
    local: { deviceId: 'desktop-b', libraryEpoch: progress.receiverLibraryEpoch },
    remote: { deviceId: progress.providerDeviceId, libraryEpoch: progress.providerLibraryEpoch },
    peerOrigin: sourceSnapshot.origin, staging: createDesktopFramedSyncStaging(receiver.db), nodeId: 'topic' });
  receiver.reopen();
  assert.equal((await loadCurrentSyncNodeRecord(receiver.db, 'topic'))!.body_text, 'Edited body');
  const source = new Database(sourceSnapshot.databasePath, { readonly: true });
  try {
    assert.equal(source.prepare("SELECT content FROM nodes WHERE id = 'topic'").pluck().get(), 'Edited body');
    assert.equal(source.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'phone-saved-edit'").pluck().get(), 'Edited body');
  } finally { source.close(); }
}

it('completes verified reception and returns a saved edit over HTTP without replaying the source body', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let receiver: Receiver | undefined;
  let passed = false;
  try {
    await fixture.left.seed({ nodeId: 'topic', title: 'Original', content: 'Original body' });
    receiver = await openCompanionAdoptionFixture(fixture.root, fixture.leftSnapshot);
    const progress = { groupId: receiver.adoption.groupId, overwriteId: receiver.adoption.libraryEpoch,
      providerDeviceId: fixture.leftSnapshot.deviceId, providerLibraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
      receiverDeviceId: 'desktop-b', receiverLibraryEpoch: receiver.adoption.libraryEpoch };
    await prepareSyncGroupOverwrite(receiver.db, progress);
    const context: Context = { ...progress, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch };
    const transferId = await receiveOriginal(receiver, context);
    await saveEdit(receiver);
    const replay = await retryOriginal(receiver, context, transferId);
    await finishAndReturnEdit(receiver, context, fixture.leftSnapshot, progress, replay);
    passed = true;
  } finally {
    receiver?.close();
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info('Preserved failed adoption fixture:', fixture.root);
  }
}, 60_000);
