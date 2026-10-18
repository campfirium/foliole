// @vitest-environment node
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { materializeDesktopSettingRecord } from './desktopSettingMaterializer.js';
import { context, restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const objectId = 'user_space:windows:desktop:*:readwise_active_host';
const options = { onPayloadAppliedInTransaction: materializeDesktopSettingRecord };
function owner(epoch: number, identity = 'owner') {
  return JSON.stringify({ device_identity_key: `${identity}-${epoch}`, epoch, host_name: `Owner ${epoch}` });
}
async function seed(peer: RestorePeer, epoch: number, time: string, identity = 'owner') {
  return seedValue(peer, owner(epoch, identity), time);
}
async function seedValue(peer: RestorePeer, valueJson: string, time: string) {
  const payload = { key: 'readwise_active_host', scope: 'user_space', platform: 'windows',
    form_factor: 'desktop', host_name: '*', value_json: valueJson };
  const record = { object_type: 'setting' as const, object_id: objectId,
    content_hash: computeSyncContentHash('setting', payload), payload_json: JSON.stringify(payload),
    updated_at: time, deleted_at: null };
  await peer.db.transaction(tx => applySyncObjectInTransaction(tx, record, options));
  return record.content_hash;
}
async function transfer(source: RestorePeer, target: RestorePeer) {
  const [difference] = compareFramedSyncInventories({
    local: await readRequestSyncInventorySnapshot(source.db), remote: [] });
  expect(difference).toBeDefined();
  await withRequestSyncFiles(source.host.files, async request => {
    await writeRequestSyncSnapshot(source.db, difference!, request);
    await applyRequestSyncObject(target.db, {
      context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
      peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
        library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {},
        devices: [], removals: [], restore: null },
      objectType: 'setting', globalId: objectId, requestId: new Uint8Array(16),
      facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob), objectOptions: options
    });
  });
}
function assertOwner(peer: RestorePeer, epoch: number, hash: string) {
  expect(peer.sqlite.prepare("SELECT value FROM settings WHERE key = 'readwise_active_host'").pluck().get()).toBe(owner(epoch));
  expect(peer.sqlite.prepare("SELECT value_json FROM setting_records WHERE key = 'readwise_active_host'").pluck().get()).toBe(owner(epoch));
  expect(peer.sqlite.prepare("SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_type = 'setting' AND object_id = ?")
    .get(objectId)).toEqual({ content_hash: hash, sync_dirty: 0 });
}

it.each([['earlier', 2], ['later', 2], ['later', 3]] as const)(
  'keeps the newer owner with %s timestamp and rejects conflicting owner epoch %s', async (timestamp, staleEpoch) => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  const stale = fixture.peer('observer');
  try {
    await seed(target, 2, '2026-10-01T02:00:00Z');
    target.sqlite.prepare("UPDATE sync_object_state SET sync_dirty = 1 WHERE object_type = 'setting' AND object_id = ?").run(objectId);
    const hash = await seed(source, 3, timestamp === 'earlier' ? '2026-10-01T01:00:00Z' : '2026-10-01T03:00:00Z');
    await seed(stale, staleEpoch, '2026-10-01T04:00:00Z', 'stale-owner');
    await transfer(source, target);
    assertOwner(target, 3, hash);
    await transfer(stale, target);
    await transfer(stale, target);
    target.reopen();
    assertOwner(target, 3, hash);
  } finally { await fixture.close(); }
});

it('upgrades a legacy owner without an epoch and cannot regress after replay or restart', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  const legacy = fixture.peer('observer');
  try {
    const legacyValue = JSON.stringify({ host_name: 'Legacy desktop' });
    await seedValue(target, legacyValue, '2026-10-10T00:00:00Z');
    await seedValue(legacy, legacyValue, '2026-10-11T00:00:00Z');
    const hash = await seed(source, 1, '2026-10-01T00:00:00Z');
    await transfer(source, target);
    assertOwner(target, 1, hash);
    await transfer(legacy, target);
    await transfer(source, target);
    target.reopen();
    assertOwner(target, 1, hash);
  } finally { await fixture.close(); }
});

it.each([null, '2', -1, 1.5])('does not reinterpret invalid local epoch %s as a legacy zero', async epoch => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const invalid = JSON.stringify({ host_name: 'Invalid owner', epoch });
    await seedValue(target, invalid, '2026-10-01T00:00:00Z');
    await seed(source, 3, '2026-10-02T00:00:00Z');
    await transfer(source, target);
    target.reopen();
    expect(target.sqlite.prepare("SELECT value_json FROM setting_records WHERE key = 'readwise_active_host'")
      .pluck().get()).toBe(invalid);
  } finally { await fixture.close(); }
});
