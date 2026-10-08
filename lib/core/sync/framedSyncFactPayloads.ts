import { sha256 } from '@noble/hashes/sha2.js';

import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { FRAMED_SYNC_FACT_FRAGMENT_BYTES, FRAMED_SYNC_MAX_ENCODED_FACT_BYTES } from './framedSyncFactFragmentContract.js';
import { streamValidatedFactProtocolMessage } from './framedSyncProtocolCodec.js';
import { factToWire, wireUint64 } from './framedSyncWireProjection.js';

type FactPayload = Readonly<{ frameType: number; payloadCase: 'fact' | 'fact_fragment'; payload: unknown }>;

/** Hash and emit the same frozen fact without materializing its complete protobuf bytes. */
export function* iterateFramedSyncFactPayloads(fact: CanonicalFact): Generator<FactPayload> {
  const wire = factToWire(fact);
  const hash = sha256.create();
  let totalByteLength = 0;
  for (const bytes of streamValidatedFactProtocolMessage(wire)) {
    totalByteLength += bytes.byteLength;
    if (totalByteLength > FRAMED_SYNC_MAX_ENCODED_FACT_BYTES) throw new Error('fact_encoded_limit_exceeded');
    hash.update(bytes);
  }
  if (totalByteLength <= FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes) {
    yield { frameType: FRAMED_SYNC_FRAME_TYPES.fact, payloadCase: 'fact', payload: wire };
    return;
  }
  const encodedSha256 = hash.digest();
  let data = new Uint8Array(FRAMED_SYNC_FACT_FRAGMENT_BYTES);
  let used = 0;
  let offset = 0;
  const fragment = (): FactPayload => ({ frameType: FRAMED_SYNC_FRAME_TYPES.fact, payloadCase: 'fact_fragment',
    payload: { identity: wire.identity, sharedStateHash: wire.sharedStateHash,
      encodedSha256, totalByteLength: wireUint64(BigInt(totalByteLength)), offset: wireUint64(BigInt(offset)), data: data.subarray(0, used) } });
  for (const bytes of streamValidatedFactProtocolMessage(wire)) {
    for (let start = 0; start < bytes.byteLength;) {
      const count = Math.min(bytes.byteLength - start, data.byteLength - used);
      data.set(bytes.subarray(start, start + count), used);
      used += count;
      start += count;
      if (used === data.byteLength) {
        yield fragment();
        offset += used;
        data = new Uint8Array(FRAMED_SYNC_FACT_FRAGMENT_BYTES);
        used = 0;
      }
    }
  }
  if (used) yield fragment();
}
