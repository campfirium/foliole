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
}

export type RequestSyncMessage = Readonly<{ payloadCase: ProtocolPayloadCase; payload: unknown }>;

/** Facts precede their bodies; a complete end record is required before any business apply. */
export async function* requestSyncObjectMessages(header: RequestSyncObjectHeader,
  contextId: Uint8Array, files: RequestSyncFiles): AsyncGenerator<RequestSyncMessage> {
  const digest = sha256.create();
  const bodyHashes = new Set<string>();
  let factCount = 0n;
  const account = (message: RequestSyncMessage) => {
    digest.update(encodeValidatedProtocolMessage(message.payloadCase, message.payload));
    return message;
  };
  yield account({ payloadCase: 'request_object_header', payload: header });
  for await (const fact of files.readFacts()) {
    if (fact.objectType !== header.objectType || fact.globalId !== header.globalId) {
      throw new Error('request_sync_object_identity_mismatch');
    }
    for (const message of iterateFramedSyncFactPayloads(fact)) yield account(message);
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
