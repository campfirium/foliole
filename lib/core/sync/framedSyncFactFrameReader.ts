import { sha256 } from '@noble/hashes/sha2.js';

import { framedSyncBytes } from '../database/framedSyncStagingSerialization.js';

import type { DbPort, DbRow } from './dbPort.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { FramedSyncFactFragmentProgress } from './framedSyncFactFragmentProgress.js';
import { decodeAndValidateProtocolMessage, type ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';

export type FramedSyncReadyFactSource = 'desktop' | 'android' | 'ios';
const tables = {
  desktop: 'framed_sync_inbound_frames',
  android: 'framed_android.framed_sync_android_frames',
  ios: 'framed_ios.framed_sync_ios_frames'
} as const;

export function framedSyncFactFrameTable(source: FramedSyncReadyFactSource) { return tables[source]; }

/** Only a complete, hashed fact is decoded; frame decoding keeps its original hard limit. */
export class FramedSyncFactFragmentDecoder {
  private readonly progress = new FramedSyncFactFragmentProgress();
  private readonly hash = sha256.create();
  private encoded: Uint8Array | undefined;

  accept(message: ValidatedProtocolMessage, sequence: bigint) {
    const completed = this.progress.accept(message, sequence);
    this.encoded ??= new Uint8Array(Number(message.payload.totalByteLength));
    const data = message.payload.data as Uint8Array;
    this.encoded.set(data, Number(message.payload.offset));
    this.hash.update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (!completed) return null;
    const digest = this.hash.digest();
    if (!digest.every((byte, index) => byte === completed.encodedSha256[index])) {
      throw new Error('fact_fragment_digest_mismatch');
    }
    const fact = decodeAndValidateProtocolMessage(this.encoded, FRAMED_SYNC_FRAME_TYPES.fact);
    if (fact.payloadCase !== 'fact') throw new Error('fact_fragment_content_invalid');
    const identity = fact.payload.identity as Record<string, unknown>;
    const declared = message.payload.identity as Record<string, unknown>;
    if (['kind', 'objectType', 'globalId', 'factId'].some(key => identity[key] !== declared[key]) ||
        !(fact.payload.sharedStateHash as Uint8Array).every((byte, index) =>
          byte === (message.payload.sharedStateHash as Uint8Array)[index])) {
      throw new Error('fact_fragment_identity_mismatch');
    }
    return { message: fact, lastSequence: completed.lastSequence };
  }
}

export async function readFramedSyncFactFrame(db: DbPort, transferId: Uint8Array, attemptId: Uint8Array,
  firstSequence: string, source: FramedSyncReadyFactSource) {
  let decoder: FramedSyncFactFragmentDecoder | undefined;
  for (let sequence = BigInt(firstSequence); ; sequence += 1n) {
    const [row] = await db.query<DbRow>(`SELECT CASE WHEN length(authenticated_plaintext) <= ${FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes}
      THEN authenticated_plaintext ELSE NULL END AS authenticated_plaintext FROM ${tables[source]}
      WHERE transfer_id = ? AND attempt_id = ? AND sequence = ? AND frame_type = ? LIMIT 1`,
    [transferId, attemptId, sequence.toString(), FRAMED_SYNC_FRAME_TYPES.fact]);
    if (!row) throw new Error('fact_fragment_incomplete');
    if (row.authenticated_plaintext === null) throw new Error('frame_payload_limit_exceeded');
    const encoded = framedSyncBytes(row, 'authenticated_plaintext');
    if (encoded.byteLength > FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes) throw new Error('frame_payload_limit_exceeded');
    const message = decodeAndValidateProtocolMessage(encoded,
      FRAMED_SYNC_FRAME_TYPES.fact);
    if (!decoder && message.payloadCase === 'fact') return { message, lastSequence: sequence };
    decoder ??= new FramedSyncFactFragmentDecoder();
    const fact = decoder.accept(message, sequence);
    if (fact) return fact;
  }
}
