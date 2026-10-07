// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../database/framedSyncStagingSchema.js';

import type { DbPort, DbRow } from './dbPort.js';
import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from './framedSyncContract.js';
import { projectFramedSyncNodeRecord } from './framedSyncNodeProjection.js';
import { publishFramedSyncOutboundWithDbPort } from './framedSyncOutboundStaging.js';
import { readFramedSyncPublishedBodyRange } from './framedSyncPublishedBodyRange.js';
import { readFramedSyncPublishedBodyRangeOperation } from './framedSyncPublishedBodyRangeOperation.js';
import { loadFramedSyncPublishedOutboundValue } from './framedSyncPublishedOutboundValue.js';
import { upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';

const context: FramedSyncContext = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, senderDeviceId: 'sender',
  senderLibraryEpoch: 'source-epoch', receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' };

async function fixture(body: string, role = 1) {
  const host = textDevice();
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  const projection = projectFramedSyncNodeRecord(textBranch('version', body));
  const original = projection.manifest.blobs[0]!;
  const blob = { ...original, role };
  const manifest = role === 1 ? projection.manifest : { blobs: [blob],
    facts: [{ ...projection.manifest.facts[0]!, blobs: [blob] }] };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  await upsertTextBodyBlob(host.db, body, 'now', bytesToHex(blob.sha256));
  await host.db.transaction((tx) => publishFramedSyncOutboundWithDbPort(tx,
    { context, contentId, manifest, manifestHash: contentId, transferId }));
  await migrateBodyContentStorage(host.db);
  host.sqlite.exec('DROP TABLE content_blob_data');
  return { ...host, input: { transferId: bytesToHex(transferId), hash: bytesToHex(blob.sha256),
    offset: 0, maxBytes: 512 * 1024 } };
}

function metadataOnly(db: DbPort): DbPort {
  return { ...db, async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) {
    if (/content_blob_data|content_body_chunks/u.test(sql)) throw new Error('unexpected_body_read');
    return db.query<T>(sql, params);
  }, transaction: (run) => db.transaction((tx) => run(metadataOnly(tx))) };
}

it.each([1, 5])('restores native publication descriptors and reads bounded exact raw bytes for role %s', async (role) => {
  for (const body of ['', '\ufeff中😀\0'.repeat(400_000)]) {
    const value = await fixture(body, role);
    try {
      const published = await loadFramedSyncPublishedOutboundValue(metadataOnly(value.db), context,
        value.input.transferId, 'chunked');
      expect(published.blobs).toEqual([expect.objectContaining({ body_source: 'verified_chunks', role })]);
      expect(published.blobs[0]).not.toHaveProperty('data_text');
      const bytes = Buffer.from(body);
      for (let offset = 0; offset < bytes.length; offset += value.input.maxBytes) {
        const part = await readFramedSyncPublishedBodyRange(value.db, context, { ...value.input, offset });
        expect(Buffer.from(part).equals(bytes.subarray(offset, offset + value.input.maxBytes))).toBe(true);
      }
      expect(await readFramedSyncPublishedBodyRange(value.db, context, { ...value.input, offset: bytes.length }))
        .toEqual(new Uint8Array());
    } finally { value.sqlite.close(); }
  }
});

it('rejects another context, unheld body and invalid range without widening the requested bytes', async () => {
  const value = await fixture('Original');
  try {
    await expect(readFramedSyncPublishedBodyRange(value.db, { ...context, receiverLibraryEpoch: 'other' }, value.input))
      .rejects.toThrow('framed_sync_publication_context_missing');
    for (const change of [{ offset: -1 }, { maxBytes: 524289 }, { offset: 9 }]) {
      await expect(readFramedSyncPublishedBodyRange(value.db, context, { ...value.input, ...change }))
        .rejects.toThrow('body_range_invalid');
    }
    await expect(readFramedSyncPublishedBodyRange(value.db, context, { ...value.input, hash: 'a'.repeat(64) }))
      .rejects.toThrow('framed_sync_published_body_not_held');
    value.sqlite.exec('DELETE FROM framed_sync_outbound_holds');
    await expect(readFramedSyncPublishedBodyRange(value.db, context, value.input))
      .rejects.toThrow('framed_sync_published_body_not_held');
  } finally { value.sqlite.close(); }
});

it('rejects missing stable chunks while retaining the frozen publication and hold for retry', async () => {
  const value = await fixture('Original');
  try {
    value.sqlite.exec('DROP TRIGGER content_body_chunks_immutable_delete; DELETE FROM content_body_chunks');
    await expect(readFramedSyncPublishedBodyRange(value.db, context, value.input))
      .rejects.toThrow('body_content_unavailable');
    expect(value.sqlite.prepare('SELECT state FROM framed_sync_outbound_publications').pluck().get()).toBe('published');
    expect(value.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
  } finally { value.sqlite.close(); }
});

it('returns bounded canonical bridge bytes and rejects noncanonical range arguments', async () => {
  const body = '\ufeff中文😀\0'.repeat(100_000);
  const value = await fixture(body);
  const payload = { group_id: context.groupId, sender_device_id: context.senderDeviceId,
    sender_library_epoch: context.senderLibraryEpoch, receiver_device_id: context.receiverDeviceId,
    receiver_library_epoch: context.receiverLibraryEpoch, transfer_id: value.input.transferId,
    sha256: value.input.hash, offset: '0', max_bytes: 512 * 1024 };
  try {
    const result = await readFramedSyncPublishedBodyRangeOperation(value.db, payload);
    expect(result).toEqual({ sha256: payload.sha256, offset: '0', byte_length: '524288',
      data_base64: Buffer.from(body).subarray(0, 524288).toString('base64') });
    expect(await readFramedSyncPublishedBodyRangeOperation(value.db,
      { ...payload, offset: String(Buffer.byteLength(body)) })).toEqual({
      sha256: payload.sha256, offset: String(Buffer.byteLength(body)), byte_length: '0', data_base64: '' });
    for (const change of [{ offset: 0 }, { offset: '00' }, { offset: '-1' },
      { offset: '9007199254740992' }, { max_bytes: '524288' }, { max_bytes: true }, { max_bytes: 524289 }]) {
      await expect(readFramedSyncPublishedBodyRangeOperation(value.db, { ...payload, ...change }))
        .rejects.toThrow('body_range_invalid');
    }
  } finally { value.sqlite.close(); }
});
