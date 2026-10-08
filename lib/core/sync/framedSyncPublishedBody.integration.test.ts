// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';

import type { DbPort, DbRow } from './dbPort.js';
import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from './framedSyncContract.js';
import { stageFramedSyncFrozenBody } from './framedSyncFrozenBody.js';
import { projectFramedSyncNodeRecord } from './framedSyncNodeProjection.js';
import { publishFramedSyncOutboundWithDbPort } from './framedSyncOutboundStaging.js';
import { readFramedSyncPublishedBody } from './framedSyncPublishedBody.js';
import { readFramedSyncPublishedBodyOperation } from './framedSyncPublishedBodyOperation.js';
import { loadFramedSyncPublishedOutboundValue } from './framedSyncPublishedOutboundValue.js';

const context: FramedSyncContext = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, senderDeviceId: 'sender',
  senderLibraryEpoch: 'source-epoch', receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' };

async function fixture(body: string, role = 1) {
  const host = textDevice();
  const projection = projectFramedSyncNodeRecord(textBranch('version', body));
  const blob = { ...projection.manifest.blobs[0]!, role };
  const manifest = role === 1 ? projection.manifest : { blobs: [blob],
    facts: [{ ...projection.manifest.facts[0]!, blobs: [blob] }] };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  await host.db.transaction(async (tx) => {
    await stageFramedSyncFrozenBody(tx, blob, new TextEncoder().encode(body));
    await publishFramedSyncOutboundWithDbPort(tx, { context, contentId, manifest, manifestHash: contentId, transferId });
  });
  host.sqlite.exec('DROP TABLE content_blob_data');
  return { ...host, input: { transferId: bytesToHex(transferId), hash: bytesToHex(blob.sha256), byteLength: Buffer.byteLength(body) } };
}

function metadataOnly(db: DbPort): DbPort {
  return { ...db, async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) {
    if (/content_blob_data|content_body_chunks|FROM nodes|FROM node_sync_versions|framed_sync_available_blobs/u.test(sql)) {
      throw new Error('unexpected_body_read');
    }
    return db.query<T>(sql, params);
  }, transaction: (run) => db.transaction((tx) => run(metadataOnly(tx))) };
}

it.each([1, 5])('returns descriptors only and reads one exact complete frozen body for role %s', async (role) => {
  for (const body of ['', '\ufeff中😀\0'.repeat(50_000), 'x'.repeat(1_048_576)]) {
    const value = await fixture(body, role);
    try {
      const published = await loadFramedSyncPublishedOutboundValue(metadataOnly(value.db), context, value.input.transferId);
      expect(published.blobs).toEqual([expect.objectContaining({ body_source: 'frozen_body', role })]);
      expect(published.blobs[0]).not.toHaveProperty('data_text');
      expect(Buffer.from(await readFramedSyncPublishedBody(value.db, context, value.input))).toEqual(Buffer.from(body));
    } finally { value.sqlite.close(); }
  }
});

it('rejects a different context, an unheld body and a mismatched complete length', async () => {
  const value = await fixture('Original');
  try {
    await expect(readFramedSyncPublishedBody(value.db, { ...context, receiverLibraryEpoch: 'other' }, value.input))
      .rejects.toThrow('framed_sync_publication_context_missing');
    for (const byteLength of [-1, 1_048_577, 9]) {
      await expect(readFramedSyncPublishedBody(value.db, context, { ...value.input, byteLength }))
        .rejects.toThrow('framed_sync_body_length_invalid');
    }
    await expect(readFramedSyncPublishedBody(value.db, context, { ...value.input, hash: 'a'.repeat(64) }))
      .rejects.toThrow('framed_sync_published_body_not_held');
    value.sqlite.exec('DELETE FROM framed_sync_outbound_holds');
    await expect(readFramedSyncPublishedBody(value.db, context, value.input)).rejects.toThrow('framed_sync_published_body_not_held');
  } finally { value.sqlite.close(); }
});

it('retains publication responsibility when its frozen bytes are missing or corrupt', async () => {
  for (const corrupt of [false, true]) {
    const value = await fixture('Original');
    try {
      value.sqlite.exec(corrupt ? "UPDATE framed_sync_available_blobs SET data = x'00'" : 'DELETE FROM framed_sync_available_blobs');
      await expect(readFramedSyncPublishedBody(value.db, context, value.input)).rejects.toThrow();
      expect(value.sqlite.prepare('SELECT state FROM framed_sync_outbound_publications').pluck().get()).toBe('published');
      expect(value.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
    } finally { value.sqlite.close(); }
  }
});

it('returns canonical complete bridge bytes and rejects range or noncanonical length requests', async () => {
  const body = '\ufeff中文😀\0'.repeat(50_000);
  const value = await fixture(body);
  const payload = { group_id: context.groupId, sender_device_id: context.senderDeviceId,
    sender_library_epoch: context.senderLibraryEpoch, receiver_device_id: context.receiverDeviceId,
    receiver_library_epoch: context.receiverLibraryEpoch, transfer_id: value.input.transferId,
    sha256: value.input.hash, byte_length: String(value.input.byteLength) };
  try {
    expect(await readFramedSyncPublishedBodyOperation(value.db, payload)).toEqual({ sha256: payload.sha256,
      byte_length: String(Buffer.byteLength(body)), data_base64: Buffer.from(body).toString('base64') });
    for (const change of [{ byte_length: 0 }, { byte_length: '00' }, { byte_length: '-1' },
      { byte_length: '9007199254740992' }, { byte_length: true }, { offset: '0' }, { max_bytes: 524288 }]) {
      await expect(readFramedSyncPublishedBodyOperation(value.db, { ...payload, ...change }))
        .rejects.toThrow('framed_sync_body_length_invalid');
    }
  } finally { value.sqlite.close(); }
});
