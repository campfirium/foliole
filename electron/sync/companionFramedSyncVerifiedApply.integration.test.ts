// @vitest-environment node
import { isDeepStrictEqual } from 'node:util';

import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { canonicalContentId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { restoreFramedSyncNodeMetadata } from '../../lib/core/sync/framedSyncNodeRestore.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { applyCompanionFramedSyncDataOperation } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncDataOperation.js';
import { applyVerifiedCompanionFramedSyncTransfer } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncVerifiedApply.js';

import { verifiedCompanionFixture } from './companionFramedSyncVerifiedApply.testSupport.js';

const kinds = ['android', 'ios'] as const;
const largeBody = '\ufeff---\r\nkey: 中文😀\0\r\n---\r\n' + '中😀'.repeat(100_000);
const mainTables = ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state',
  'content_blobs', 'framed_sync_receipts',
  'framed_sync_inventory', 'framed_sync_version_summary'];

it.each(kinds)('streams %s child-first version history through ready application and receipt replay', async (kind) => {
  const host = await verifiedCompanionFixture(kind, 'Original');
  try {
    const frame = host.native.prepare<[], { authenticated_plaintext: Uint8Array }>(
      `SELECT authenticated_plaintext FROM ${host.prefix}_frames WHERE frame_type = 3`).get()!;
    const first = canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(frame.authenticated_plaintext, 3));
    const metadata = restoreFramedSyncNodeMetadata(first);
    const record = { ...metadata, version_id: 'version-2', parent_version_id: 'version-1',
      parent_version_ids: ['version-1'], ancestor_version_ids: ['version-1'], body_text: 'Original',
      snapshot: { ...metadata.snapshot, content: 'Original' } };
    const next = projectFramedSyncNodeRecord(record).manifest.facts[0]!;
    const contentId = await canonicalContentId({ facts: [next, first], blobs: first.blobs });
    host.native.prepare(`UPDATE ${host.prefix}_frames SET sequence = '1' WHERE frame_type = 3`).run();
    host.native.prepare(`INSERT INTO ${host.prefix}_frames VALUES (?, ?, '0', 3, ?, ?, ?, ?)`)
      .run(host.input.transferId, new Uint8Array(16).fill(1), new Uint8Array(96), new Uint8Array(16),
        Uint8Array.of(1), encodeValidatedProtocolMessage('fact', factToWire(next)));
    host.native.prepare(`UPDATE ${host.prefix}_transfers SET fact_count = 2, content_id = ?`).run(contentId);
    const receipt = await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input);
    expect(receipt.contentId).toEqual(contentId);
    expect(host.main.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all())
      .toEqual([{ version_id: 'version-1' }, { version_id: 'version-2' }]);
    expect(host.main.prepare('SELECT current_version_id FROM nodes').pluck().get()).toBe('version-2');
    expect(host.main.prepare('SELECT parent_version_id FROM node_sync_version_parents').pluck().get()).toBe('version-1');
    host.reopen();
    expect(await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input)).toEqual(receipt);
    expect((await loadCurrentSyncNodeRecord(host.port(), 'node-1'))?.body_text).toBe('Original');
  } finally { host.close(); }
});

it.each(kinds)('applies %s ordinary data requests through owned full node and version bodies', async (kind) => {
  const host = await verifiedCompanionFixture(kind, largeBody);
  try {
    const payload = { receiver_device_id: host.input.receiverDeviceId,
      receiver_library_epoch: host.input.receiverLibraryEpoch, sender_device_id: host.input.senderDeviceId,
      sender_library_epoch: host.input.senderLibraryEpoch, staging_kind: kind,
      staging_path: host.input.stagingPath, transfer_id: bytesToHex(host.input.transferId) };
    const receipt = await applyCompanionFramedSyncDataOperation(host.port(), payload);
    expect(receipt).toEqual({ applied_state_hash: '4'.repeat(64), content_id: bytesToHex(host.contentId),
      receiver_device_id: 'receiver', receiver_library_epoch: 'receiver-epoch',
      transfer_id: bytesToHex(host.input.transferId) });
    host.reopen();
    expect(await applyCompanionFramedSyncDataOperation(host.port(), payload)).toEqual(receipt);
    expect((await loadCurrentSyncNodeRecord(host.port(), 'node-1'))?.body_text).toBe(largeBody);
    expect(Math.max(...host.sizes)).toBeLessThanOrEqual(1048576 + 65536);
  } finally { host.close(); }
});

it.each(kinds)('validates %s durable bytes before returning an existing receipt', async (kind) => {
  const host = await verifiedCompanionFixture(kind, 'Original');
  try {
    await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input);
    const before = mainState(host);
    host.native.prepare(`UPDATE ${host.prefix}_available_blobs SET data = ?`)
      .run(Buffer.from('Altered!'));
    await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input)).rejects.toThrow('framed_sync_published_body_unavailable');
    expect(isDeepStrictEqual(mainState(host), before)).toBe(true);
    expect((await loadCurrentSyncNodeRecord(host.port(), 'node-1'))?.body_text).toBe('Original');
  } finally { host.close(); }
});

function mainState(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>) {
  return Object.fromEntries(mainTables.map((table) => [table, host.main.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

function readyState(host: Awaited<ReturnType<typeof verifiedCompanionFixture>>) {
  return { transfers: host.native.prepare(`SELECT * FROM ${host.prefix}_transfers`).all(),
    pins: host.native.prepare(`SELECT * FROM ${host.prefix}_blob_pins`).all(),
    headers: host.native.prepare(`SELECT * FROM ${host.prefix}_available_blobs`).all() };
}

it.each(kinds)('applies exact owned %s empty and long Unicode bodies with original version identity and receipt', async (kind) => {
  for (const body of ['', largeBody]) {
    const host = await verifiedCompanionFixture(kind, body);
    try {
      const ready = readyState(host);
      const receipt = await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input);
      const hash = hashTextBody(body);
      expect((await loadCurrentSyncNodeRecord(host.port(), 'node-1'))?.body_text).toBe(body);
      expect(host.main.prepare('SELECT id, content, body_blob_hash, current_version_id FROM nodes').all())
        .toEqual([{ id: 'node-1', content: body, body_blob_hash: hash, current_version_id: 'version-1' }]);
      expect(host.main.prepare('SELECT version_id, content_hash, body_text FROM node_sync_versions').all())
        .toEqual([{ version_id: 'version-1', content_hash: '4'.repeat(64), body_text: body }]);
      expect(receipt).toMatchObject({ receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
        transferId: host.input.transferId, contentId: host.contentId });
      expect(bytesToHex(receipt.appliedStateHash)).toBe('4'.repeat(64));
      expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
      expect(host.main.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('settings', 'search_index_invalidations')").all())
        .toEqual([]);
      expect(await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input)).toEqual(receipt);
      expect(isDeepStrictEqual(readyState(host), ready)).toBe(true);
      expect(Math.max(...host.sizes)).toBeLessThanOrEqual(1048576 + 65536);
    } finally { host.close(); }
  }
});

it.each(kinds)('rolls back %s receipt failure, reopens both databases, retries and retains owned body after staging cleanup', async (kind) => {
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
    expect(host.native.prepare(`SELECT count(*) FROM ${host.prefix}_available_blobs`).pluck().get()).toBe(0);
    host.reopen();
    expect((await loadCurrentSyncNodeRecord(host.port(), 'node-1'))?.body_text).toBe(largeBody);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it.each(kinds)('rejects %s extra pins, endpoint context and resource key mismatches without business writes', async (kind) => {
  for (const failure of ['pin', 'context', 'resources']) {
    const host = await verifiedCompanionFixture(kind, 'Original');
    try {
      if (failure === 'pin') {
        const hash = new Uint8Array(32).fill(9);
        host.native.prepare(`INSERT INTO ${host.prefix}_available_blobs VALUES (?, 0, X'')`).run(hash);
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
