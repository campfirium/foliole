// @vitest-environment node
import { isDeepStrictEqual } from 'node:util';

import { expect, it } from 'vitest';

import { adoption, businessState, largeBody, nativeState, releaseAcknowledgedCopies,
  verifiedAdoptionFixture } from '../../../../../../electron/sync/companionFramedSyncVerifiedAdoption.testSupport.js';
import { verifiedCompanionFixture } from '../../../../../../electron/sync/companionFramedSyncVerifiedApply.testSupport.js';
import { hashTextBody } from '../../../../../../lib/core/database/textBodyHash.js';
import { canonicalContentId } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { beginSyncGroupLocalAdoption, finishSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { finishSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';

import { applyVerifiedCompanionFramedSyncTransfers } from './companionFramedSyncVerifiedApply.js';

const kinds = ['android', 'ios'] as const;

async function assertAdopted(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>) {
  expect(host.main.prepare('SELECT id, parent_id, content, current_version_id, body_blob_hash FROM nodes ORDER BY id').all())
    .toEqual([{ id: 'child', parent_id: 'parent', content: largeBody, current_version_id: 'version-child', body_blob_hash: hashTextBody(largeBody) },
      { id: 'parent', parent_id: null, content: '', current_version_id: 'version-parent', body_blob_hash: hashTextBody('') }]);
  expect(host.main.prepare(`SELECT version_id, content_hash, body_text,
    json_extract(snapshot_json, '$.content') AS content FROM node_sync_versions ORDER BY version_id`).all())
    .toEqual(['child', 'parent'].map((id) => ({ version_id: `version-${id}`, content_hash: '4'.repeat(64),
      body_text: id === 'child' ? largeBody : '', content: null })));
  expect(await loadSyncGroupLocalAdoption(host.port())).toBeNull();
  expect(host.main.prepare('SELECT value FROM sync_group_metadata WHERE key = ?').pluck()
    .get('sync_group_completed_adoption')).toBe(JSON.stringify(adoption));
  expect(host.main.prepare("SELECT name FROM sqlite_master WHERE name IN ('content_blob_data', 'settings', 'search_index_invalidations')").all())
    .toEqual([]);
}

function failLate(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>, failure: string) {
  host.main.exec(failure === 'receipt' ? `CREATE TRIGGER fail_adoption BEFORE INSERT ON framed_sync_receipts
    WHEN (SELECT count(*) FROM framed_sync_receipts) = 1 BEGIN SELECT RAISE(ABORT, 'late_receipt_failure'); END`
    : `CREATE TRIGGER fail_adoption BEFORE INSERT ON sync_group_metadata
      WHEN NEW.key = 'sync_group_completed_adoption' BEGIN SELECT RAISE(ABORT, 'identity_finish_failure'); END`);
}

for (const failure of ['receipt', 'identity']) it.each(kinds)(
  `preserves committed %s units on late ${failure} failure and retries after reopening`, async (kind) => {
    const { host, inputs, child, parent } = await verifiedAdoptionFixture(kind);
    try {
      const progress = { groupId: adoption.groupId, overwriteId: adoption.libraryEpoch,
        providerDeviceId: 'sender', providerLibraryEpoch: inputs[0]!.senderLibraryEpoch,
        receiverDeviceId: 'receiver', receiverLibraryEpoch: adoption.libraryEpoch };
      const ready = nativeState(host);
      expect((await prepareSyncGroupOverwrite(host.port(), progress)).cleared).toBe(true);
      const parentReceipts = await applyVerifiedCompanionFramedSyncTransfers(host.port(), [inputs[1]!]);
      failLate(host, failure);
      const finish = () => host.port().transaction(async (tx) => {
        await finishSyncGroupOverwriteProgress(tx, progress);
        await finishSyncGroupLocalAdoption(tx, adoption);
      });
      let childReceipts;
      if (failure === 'receipt') {
        const before = businessState(host);
        await expect(applyVerifiedCompanionFramedSyncTransfers(host.port(), [inputs[0]!]))
          .rejects.toThrow('late_receipt_failure');
        expect(isDeepStrictEqual(businessState(host), before)).toBe(true);
        expect(host.main.prepare('SELECT id FROM nodes').all()).toEqual([{ id: 'parent' }]);
      } else {
        childReceipts = await applyVerifiedCompanionFramedSyncTransfers(host.port(), [inputs[0]!]);
        const before = businessState(host);
        await expect(finish()).rejects.toThrow('identity_finish_failure');
        expect(isDeepStrictEqual(businessState(host), before)).toBe(true);
      }
      expect(isDeepStrictEqual(nativeState(host), ready)).toBe(true);
      host.reopen();
      expect((await prepareSyncGroupOverwrite(host.port(), progress)).cleared).toBe(false);
      expect(host.main.prepare("SELECT id FROM nodes WHERE id = 'parent'").get()).toEqual({ id: 'parent' });
      host.main.exec('DROP TRIGGER fail_adoption');
      childReceipts ??= await applyVerifiedCompanionFramedSyncTransfers(host.port(), [inputs[0]!]);
      const receipts = [...childReceipts, ...parentReceipts];
      expect(receipts.map((receipt) => receipt.transferId)).toEqual(inputs.map((input) => input.transferId));
      expect(receipts.map((receipt) => receipt.contentId)).toEqual(await Promise.all(
        [child, parent].map((projection) => canonicalContentId(projection.manifest))));
      expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
      await finish();
      await assertAdopted(host);
      expect(await applyVerifiedCompanionFramedSyncTransfers(host.port(), inputs)).toEqual(receipts);
      releaseAcknowledgedCopies(host);
      host.reopen();
      await assertAdopted(host);
      expect(Math.max(...host.sizes)).toBeLessThanOrEqual(1024 * 1024 + 64 * 1024);
    } finally { host.close(); }
  });

it.each(kinds)('keeps %s duplicate identical inputs receipt compatible and rejects another staging owner before writes', async (kind) => {
  const host = await verifiedCompanionFixture(kind, 'Original');
  try {
    const before = businessState(host), ready = nativeState(host);
    const databases = host.main.pragma('database_list');
    await expect(applyVerifiedCompanionFramedSyncTransfers(host.port(), [host.input,
      { ...host.input, stagingPath: `${host.input.stagingPath}.other` }])).rejects.toThrow('framed_sync_staging_owner_mismatch');
    expect(isDeepStrictEqual(businessState(host), before)).toBe(true);
    expect(isDeepStrictEqual(nativeState(host), ready)).toBe(true);
    expect(host.main.pragma('database_list')).toEqual(databases);
    const receipts = await applyVerifiedCompanionFramedSyncTransfers(host.port(), [host.input, host.input]);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it.each(kinds)('completes %s empty adoption without a native staging owner or continuous body table', async (kind) => {
  const host = await verifiedCompanionFixture(kind, 'Unused ready body');
  try {
    await beginSyncGroupLocalAdoption(host.port(), adoption);
    const ready = nativeState(host);
    const progress = { groupId: adoption.groupId, overwriteId: adoption.libraryEpoch,
      providerDeviceId: host.input.senderDeviceId, providerLibraryEpoch: host.input.senderLibraryEpoch,
      receiverDeviceId: host.input.receiverDeviceId, receiverLibraryEpoch: adoption.libraryEpoch };
    await prepareSyncGroupOverwrite(host.port(), progress);
    await host.port().transaction(async (tx) => {
      await finishSyncGroupOverwriteProgress(tx, progress);
      await finishSyncGroupLocalAdoption(tx, adoption);
    });
    expect(await loadSyncGroupLocalAdoption(host.port())).toBeNull();
    expect(host.main.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
    expect(isDeepStrictEqual(nativeState(host), ready)).toBe(true);
  } finally { host.close(); }
});
