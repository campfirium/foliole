// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';

import type { DbPort, DbRow } from './dbPort.js';
import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS, type FramedSyncContext } from './framedSyncContract.js';
import { assertNodeVersionFactShape } from './framedSyncNodeFactContract.js';
import { projectFramedSyncNodeRecord } from './framedSyncNodeProjection.js';
import { publishFramedSyncOutboundWithDbPort } from './framedSyncOutboundStaging.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { readFramedSyncPublishedFactOperation } from './framedSyncPublishedFactOperation.js';
import { loadFramedSyncPublishedOutboundValue } from './framedSyncPublishedOutboundValue.js';
import { factToWire } from './framedSyncWireProjection.js';

const context: FramedSyncContext = { protocolVersion: 22, groupId: 'group', senderDeviceId: 'sender',
  senderLibraryEpoch: 'source', receiverDeviceId: 'receiver', receiverLibraryEpoch: 'target' };

function operationPayload(transferId: string) {
  return { transfer_id: transferId, group_id: context.groupId, sender_device_id: context.senderDeviceId,
    sender_library_epoch: context.senderLibraryEpoch, receiver_device_id: context.receiverDeviceId,
    receiver_library_epoch: context.receiverLibraryEpoch, fact_index: 0, fragment_index: 0 };
}

async function fixture(large: boolean) {
  const host = textDevice();
  const original = textBranch('original-version', 'Body');
  const record = large ? { ...original,
    snapshot: { ...original.snapshot, title: 't'.repeat(1_200_000), opening_text: 'o'.repeat(1_200_000) } } : original;
  const manifest = projectFramedSyncNodeRecord(record).manifest;
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  await publishFramedSyncOutboundWithDbPort(host.db, { context, contentId, manifest, manifestHash: contentId, transferId });
  return { ...host, manifest, transferId: bytesToHex(transferId) };
}

function observeReads(db: DbPort, rows: DbRow[]): DbPort {
  return { ...db, async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) {
    const result = await db.query<T>(sql, params);
    rows.push(...result);
    return result;
  } };
}

it('bridges one frozen production-valid large fact in bounded fragments without returning whole publications', async () => {
  const host = await fixture(true);
  const rows: DbRow[] = [];
  const db = observeReads(host.db, rows);
  try {
    const value = await loadFramedSyncPublishedOutboundValue(db, context, host.transferId);
    expect(value).not.toHaveProperty('fact_message_bytes_list');
    const header = decodeAndValidateProtocolMessage(Uint8Array.from(value.header_message_bytes), 2);
    expect(header.payload).toMatchObject({ attemptId: new Uint8Array(16) });
    const fragments: Uint8Array[] = [];
    for (let index = 0; ; index += 1) {
      const result = await readFramedSyncPublishedFactOperation(db, { ...operationPayload(host.transferId), fragment_index: index });
      expect(result.message_bytes.length).toBeLessThanOrEqual(FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes);
      const message = decodeAndValidateProtocolMessage(Uint8Array.from(result.message_bytes), 3);
      expect(message.payloadCase).toBe('fact_fragment');
      expect(message.payload.identity).toMatchObject({ factId: 'original-version', globalId: 'topic', kind: 2 });
      fragments.push(message.payload.data as Uint8Array);
      if (result.last_fragment) break;
    }
    const fact = host.manifest.facts[0]!;
    assertNodeVersionFactShape(fact);
    expect(fragments.length).toBeGreaterThan(1);
    expect(Buffer.concat(fragments)).toEqual(Buffer.from(encodeValidatedProtocolMessage('fact', factToWire(fact))));
    expect(rows.every((row) => !Object.hasOwn(row, 'manifest_json'))).toBe(true);
    expect(JSON.stringify(rows.find((row) => Object.hasOwn(row, 'metadata_json')))).not.toContain('t'.repeat(100));
  } finally { host.sqlite.close(); }
});

it('returns one small fact and rejects invalid indices, context and retired publication input', async () => {
  const host = await fixture(false);
  const payload = operationPayload(host.transferId);
  try {
    const result = await readFramedSyncPublishedFactOperation(host.db, payload);
    expect(result.last_fragment).toBe(true);
    expect(decodeAndValidateProtocolMessage(Uint8Array.from(result.message_bytes), 3).payloadCase).toBe('fact');
    for (const change of [{ fact_index: -1 }, { fact_index: 0.1 }, { fact_index: '0' },
      { fact_index: 4096 }, { fact_index: 1 }, { fragment_index: 1 }, { fragment_index: -1 },
      { fragment_index: Number.MAX_SAFE_INTEGER + 1 }, { receiver_library_epoch: 'wrong' }]) {
      await expect(readFramedSyncPublishedFactOperation(host.db, { ...payload, ...change })).rejects.toThrow();
    }
    host.sqlite.exec("UPDATE framed_sync_outbound_publications SET state = 'receipt_committed'");
    await expect(readFramedSyncPublishedFactOperation(host.db, payload)).rejects.toThrow('framed_sync_publication_context_missing');
  } finally { host.sqlite.close(); }
});
