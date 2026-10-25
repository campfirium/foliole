import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { iterateFramedSyncFactPayloads } from './framedSyncFactPayloads.js';
import { encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import type { ProtocolPayloadCase } from './framedSyncReceiver.js';
import { wireUint64 } from './framedSyncWireProjection.js';
import type { RequestSyncFiles } from './requestSyncFiles.js';

export interface RequestSyncObjectHeader {
  requestId: Uint8Array;
  objectType: string;
  globalId: string;
  sourceStateHash: Uint8Array;
  currentVersionId: string;
}

export type RequestSyncMessage = Readonly<{ payloadCase: ProtocolPayloadCase; payload: unknown; attachmentBoundary?: true }>;
const objectMessageBytes = new WeakMap<RequestSyncMessage, Uint8Array>();

/** Object digest and encryption consume the same owned, validated encoding. */
export function encodeRequestSyncMessage(message: RequestSyncMessage) {
  return objectMessageBytes.get(message) ?? encodeValidatedProtocolMessage(message.payloadCase, message.payload);
}

/** Facts precede their bodies; a complete end record is required before any business apply. */
export async function* requestSyncObjectMessages(header: RequestSyncObjectHeader,
  contextId: Uint8Array, files: RequestSyncFiles): AsyncGenerator<RequestSyncMessage> {
  const digest = sha256.create();
  const bodyHashes = new Set<string>();
  let factCount = 0n;
  const account = (message: RequestSyncMessage,
    encoded = encodeValidatedProtocolMessage(message.payloadCase, message.payload)) => {
    objectMessageBytes.set(message, encoded);
    digest.update(encoded);
    return message;
  };
  yield account({ payloadCase: 'request_object_header', payload: header });
  for await (const record of files.readFactRecords()) {
    const { fact } = record;
    if (fact.objectType !== header.objectType || fact.globalId !== header.globalId) {
      throw new Error('request_sync_object_identity_mismatch');
    }
    if (record.wire) yield account(record.wire.message, record.wire.encoded);
    else for (const message of iterateFramedSyncFactPayloads(fact)) yield account(message);
    factCount++;
    for (const blob of fact.blobs) {
      const key = bytesToHex(blob.sha256);
      if (bodyHashes.has(key)) continue;
      const data = await files.loadBody(blob);
      for (let offset = 0; offset < data.length; offset += FRAMED_SYNC_LIMITS.blobChunkBytes) {
        yield account({ payloadCase: 'blob_chunk', payload: { transferId: contextId, blobHash: blob.sha256,
          offset: wireUint64(BigInt(offset)), data: data.subarray(offset, offset + FRAMED_SYNC_LIMITS.blobChunkBytes) } });
      }
      bodyHashes.add(key);
    }
  }
  yield { payloadCase: 'request_object_end', payload: { requestId: header.requestId,
    streamHash: digest.digest(), factCount: wireUint64(factCount), bodyCount: wireUint64(BigInt(bodyHashes.size)) } };
}

export function assertRequestSyncObjectSource(header: RequestSyncObjectHeader,
  expected?: { sharedStateHash: Uint8Array; currentVersionId?: string | undefined }) {
  if (!expected) return;
  if (header.currentVersionId !== (expected.currentVersionId ?? '')) {
    throw new Error('request_sync_object_source_mismatch');
  }
}
