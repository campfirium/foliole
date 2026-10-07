// @vitest-environment node
import { isDeepStrictEqual } from 'node:util';

import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { loadVerifiedBodyRef, readBodyText } from '../../lib/core/sync/verifiedBody.js';
import { applyVerifiedCompanionFramedSyncTransfer } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncVerifiedApply.js';

import { verifiedCompanionFixture } from './companionFramedSyncVerifiedApply.testSupport.js';

const kinds = ['android', 'ios'] as const;
const largeBody = '\ufeff---\r\nkey: 中文😀\0\r\n---\r\n' + '中😀'.repeat(600_000);
const mainTables = ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state',
  'content_bodies', 'content_body_chunks', 'content_blobs', 'framed_sync_receipts',
  'framed_sync_inventory', 'framed_sync_version_summary'];

it.each(kinds)('validates %s durable bytes before returning an existing receipt', async (kind) => {
  const host = await verifiedCompanionFixture(kind, 'Original');
  try {
    await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input);
    const before = mainState(host);
    host.native.prepare(`UPDATE ${host.prefix}_available_blob_chunks SET data = ? WHERE byte_offset = 0`)
      .run(Buffer.from('Altered!'));
    await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input)).rejects.toThrow('blob_hash_mismatch');
    expect(isDeepStrictEqual(mainState(host), before)).toBe(true);
    const ref = (await loadVerifiedBodyRef(host.port(), hashTextBody('Original')))!;
    expect(await readBodyText(host.port(), ref)).toBe('Original');
  } finally { host.close(); }
});

function mainState(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>) {
  return Object.fromEntries(mainTables.map((table) => [table, host.main.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

function readyState(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>) {
  return { transfers: host.native.prepare(`SELECT * FROM ${host.prefix}_transfers`).all(),
    pins: host.native.prepare(`SELECT * FROM ${host.prefix}_blob_pins`).all(),
    headers: host.native.prepare(`SELECT * FROM ${host.prefix}_available_blobs`).all(),
    chunks: host.native.prepare(`SELECT * FROM ${host.prefix}_available_blob_chunks ORDER BY byte_offset`).all() };
}

it.each(kinds)('applies exact stable %s empty and long Unicode bodies with original version identity and receipt', async (kind) => {
  for (const body of ['', largeBody]) {
    const host = await verifiedCompanionFixture(kind, body);
    try {
      const ready = readyState(host);
      const receipt = await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input);
      const ref = (await loadVerifiedBodyRef(host.port(), hashTextBody(body)))!;
      expect(await readBodyText(host.port(), ref)).toBe(body);
      expect(host.main.prepare('SELECT id, content, body_blob_hash, current_version_id FROM nodes').all())
        .toEqual([{ id: 'node-1', content: '', body_blob_hash: ref.hash, current_version_id: 'version-1' }]);
      expect(host.main.prepare(`SELECT version_id, content_hash, body_text, body_state, body_blob_hash,
        json_extract(snapshot_json, '$.content') AS content FROM node_sync_versions`).all())
        .toEqual([{ version_id: 'version-1', content_hash: '4'.repeat(64), body_text: null,
          body_state: 'readable', body_blob_hash: ref.hash, content: null }]);
      expect(receipt).toMatchObject({ receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
        transferId: host.input.transferId, contentId: host.contentId });
      expect(bytesToHex(receipt.appliedStateHash)).toBe('4'.repeat(64));
      expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
      expect(host.main.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('settings', 'search_index_invalidations')").all())
        .toEqual([]);
      expect(await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input)).toEqual(receipt);
      expect(isDeepStrictEqual(readyState(host), ready)).toBe(true);
      expect(Math.max(...host.sizes)).toBeLessThanOrEqual(512 * 1024);
    } finally { host.close(); }
  }
});

it.each(kinds)('rolls back %s receipt failure, reopens both databases, retries and retains adopted body after staging cleanup', async (kind) => {
  const host = await verifiedCompanionFixture(kind, largeBody);
  try {
    const before = mainState(host), ready = readyState(host);
    host.main.exec(`CREATE TRIGGER fail_business_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'receipt_disk_failure'); END`);
    await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input)).rejects.toThrow('receipt_disk_failure');
    expect(isDeepStrictEqual(mainState(host), before)).toBe(true);
    expect(isDeepStrictEqual(readyState(host), ready)).toBe(true);
    expect((host.main.pragma('database_list') as Array<{ name: string }>).map((row) => row.name))
      .not.toContain(`framed_${kind}`);
    host.reopen();
    expect(isDeepStrictEqual(readyState(host), ready)).toBe(true);
    host.main.exec('DROP TRIGGER fail_business_receipt');
    const receipt = await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input);
    expect(await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input)).toEqual(receipt);
    host.native.prepare(`DELETE FROM ${host.prefix}_blob_pins WHERE transfer_id = ?`).run(host.input.transferId);
    host.native.prepare(`DELETE FROM ${host.prefix}_available_blobs WHERE sha256 = ?`).run(host.descriptor.sha256);
    expect(host.native.prepare(`SELECT count(*) FROM ${host.prefix}_available_blob_chunks`).pluck().get()).toBe(0);
    host.reopen();
    const ref = (await loadVerifiedBodyRef(host.port(), hashTextBody(largeBody)))!;
    expect(await readBodyText(host.port(), ref)).toBe(largeBody);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it.each(kinds)('rejects %s extra pins, endpoint context and resource key mismatches without business writes', async (kind) => {
  for (const failure of ['pin', 'context', 'resources']) {
    const host = await verifiedCompanionFixture(kind, 'Original');
    try {
      if (failure === 'pin') {
        const hash = new Uint8Array(32).fill(9);
        host.native.prepare(`INSERT INTO ${host.prefix}_available_blobs VALUES (?, 0)`).run(hash);
        host.native.prepare(`INSERT INTO ${host.prefix}_blob_pins VALUES (?, ?, 0, 1, 1)`).run(host.input.transferId, hash);
      }
      const before = mainState(host), ready = readyState(host);
      const input = { ...host.input,
        ...(failure === 'context' ? { receiverLibraryEpoch: 'other' } : {}),
        ...(failure === 'resources' ? { resourceStorageKeys: [`${'a'.repeat(64)}.png`] } : {}) };
      const error = failure === 'pin' ? 'framed_sync_android_blob_identity_mismatch'
        : failure === 'context' ? 'framed_sync_transfer_context_mismatch' : 'framed_sync_android_resource_identity_mismatch';
      await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), input)).rejects.toThrow(error);
      expect(isDeepStrictEqual(mainState(host), before)).toBe(true);
      expect(isDeepStrictEqual(readyState(host), ready)).toBe(true);
      expect((host.main.pragma('database_list') as Array<{ name: string }>).map((row) => row.name))
        .not.toContain(`framed_${kind}`);
    } finally { host.close(); }
  }
});
