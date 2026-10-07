// @vitest-environment node
import { isDeepStrictEqual } from 'node:util';

import { expect, it } from 'vitest';

import { adoption, businessState, largeBody, nativeState, releaseAcknowledgedCopies,
  verifiedAdoptionFixture } from '../../../../../../electron/sync/companionFramedSyncVerifiedAdoption.testSupport.js';
import { verifiedCompanionFixture } from '../../../../../../electron/sync/companionFramedSyncVerifiedApply.testSupport.js';
import { hashTextBody } from '../../../../../../lib/core/database/textBodyHash.js';
import { canonicalContentId } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadVerifiedBodyRef, readBodyText } from '../../../../../../lib/core/sync/verifiedBody.js';

import { applyVerifiedCompanionFramedSyncTransfers } from './companionFramedSyncVerifiedApply.js';

const kinds = ['android', 'ios'] as const;

async function assertAdopted(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>) {
  expect(host.main.prepare('SELECT id, parent_id, content, current_version_id, body_blob_hash FROM nodes ORDER BY id').all())
    .toEqual([{ id: 'child', parent_id: 'parent', content: '', current_version_id: 'version-child', body_blob_hash: hashTextBody(largeBody) },
      { id: 'parent', parent_id: null, content: '', current_version_id: 'version-parent', body_blob_hash: hashTextBody('') }]);
  expect(host.main.prepare(`SELECT version_id, content_hash, body_text, body_state,
    json_extract(snapshot_json, '$.content') AS content FROM node_sync_versions ORDER BY version_id`).all())
    .toEqual(['child', 'parent'].map((id) => ({ version_id: `version-${id}`, content_hash: '4'.repeat(64),
      body_text: null, body_state: 'readable', content: null })));
  for (const body of [largeBody, '']) {
    const ref = (await loadVerifiedBodyRef(host.port(), hashTextBody(body)))!;
    expect(await readBodyText(host.port(), ref)).toBe(body);
  }
  expect(await loadSyncGroupLocalAdoption(host.port())).toBeNull();
  expect(host.main.prepare('SELECT value FROM sync_group_metadata WHERE key = ?').pluck()
    .get('sync_group_completed_adoption')).toBe(JSON.stringify(adoption));
  expect(host.main.prepare("SELECT name FROM sqlite_master WHERE name IN ('content_blob_data', 'settings', 'search_index_invalidations')").all())
    .toEqual([]);
  expect(await loadVerifiedBodyRef(host.port(), hashTextBody('Original local body'))).toBeNull();
}

function failLate(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>, failure: string) {
  host.main.exec(failure === 'receipt' ? `CREATE TRIGGER fail_adoption BEFORE INSERT ON framed_sync_receipts
    WHEN (SELECT count(*) FROM framed_sync_receipts) = 1 BEGIN SELECT RAISE(ABORT, 'late_receipt_failure'); END`
    : `CREATE TRIGGER fail_adoption BEFORE INSERT ON sync_group_metadata
      WHEN NEW.key = 'sync_group_completed_adoption' BEGIN SELECT RAISE(ABORT, 'identity_finish_failure'); END`);
}

for (const failure of ['receipt', 'identity']) it.each(kinds)(
  `rolls back %s all adoption units on late ${failure} failure and retries after reopening`, async (kind) => {
    const { host, inputs, child, parent } = await verifiedAdoptionFixture(kind);
    try {
      const before = businessState(host), ready = nativeState(host);
      failLate(host, failure);
      await expect(applyVerifiedCompanionFramedSyncTransfers(host.port(), inputs, adoption))
        .rejects.toThrow(failure === 'receipt' ? 'late_receipt_failure' : 'identity_finish_failure');
      expect(isDeepStrictEqual(businessState(host), before)).toBe(true);
      expect(isDeepStrictEqual(nativeState(host), ready)).toBe(true);
      host.reopen();
      expect(isDeepStrictEqual(businessState(host), before)).toBe(true);
      expect(isDeepStrictEqual(nativeState(host), ready)).toBe(true);
      host.main.exec('DROP TRIGGER fail_adoption');
      const receipts = await applyVerifiedCompanionFramedSyncTransfers(host.port(), inputs, adoption);
      expect(receipts.map((receipt) => receipt.transferId)).toEqual(inputs.map((input) => input.transferId));
      expect(receipts.map((receipt) => receipt.contentId)).toEqual(await Promise.all(
        [child, parent].map((projection) => canonicalContentId(projection.manifest))));
      for (const receipt of receipts) expect(receipt).toMatchObject({
        receiverDeviceId: 'receiver', receiverLibraryEpoch: adoption.libraryEpoch,
        appliedStateHash: new Uint8Array(32).fill(0x44) });
      expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
      await assertAdopted(host);
      expect(isDeepStrictEqual(nativeState(host), ready)).toBe(true);
      expect(await applyVerifiedCompanionFramedSyncTransfers(host.port(), inputs)).toEqual(receipts);
      releaseAcknowledgedCopies(host);
      expect(host.native.prepare(`SELECT count(*) FROM ${host.prefix}_available_blob_chunks`).pluck().get()).toBe(0);
      host.reopen();
      await assertAdopted(host);
      expect(Math.max(...host.sizes)).toBeLessThanOrEqual(512 * 1024);
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
    expect(await applyVerifiedCompanionFramedSyncTransfers(host.port(), [], adoption)).toEqual([]);
    expect(await loadSyncGroupLocalAdoption(host.port())).toBeNull();
    expect(host.main.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
    expect(isDeepStrictEqual(nativeState(host), ready)).toBe(true);
  } finally { host.close(); }
});
