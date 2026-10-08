import { bytesToHex } from '@noble/hashes/utils.js';

import type { ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';

type Pending = Readonly<{
  encodedSha256: Uint8Array;
  firstSequence: bigint;
  key: string;
  totalByteLength: number;
}> & { nextOffset: number; nextSequence: bigint };

/** Tracks one fact's transport fragments without retaining their payloads. */
export class FramedSyncFactFragmentProgress {
  private pending: Pending | undefined;

  accept(message: ValidatedProtocolMessage, sequence: bigint) {
    if (message.payloadCase !== 'fact_fragment') throw new Error('fact_fragment_required');
    const value = message.payload;
    const identity = value.identity as Record<string, unknown>;
    const totalByteLength = Number(value.totalByteLength);
    const encodedSha256 = new Uint8Array(value.encodedSha256 as Uint8Array);
    const key = JSON.stringify([identity.kind, identity.objectType, identity.globalId, identity.factId,
      bytesToHex(new Uint8Array(value.sharedStateHash as Uint8Array)), bytesToHex(encodedSha256), totalByteLength]);
    const offset = Number(value.offset);
    if (!this.pending) this.pending = { key, totalByteLength, encodedSha256: encodedSha256.slice(),
      firstSequence: sequence, nextOffset: 0, nextSequence: sequence };
    const pending = this.pending;
    if (pending.key !== key || pending.nextOffset !== offset || pending.nextSequence !== sequence) {
      throw new Error('fact_fragment_not_contiguous');
    }
    pending.nextOffset += (value.data as Uint8Array).byteLength;
    pending.nextSequence += 1n;
    if (pending.nextOffset !== pending.totalByteLength) return null;
    this.pending = undefined;
    return { firstSequence: pending.firstSequence, lastSequence: sequence,
      encodedSha256: pending.encodedSha256, totalByteLength: pending.totalByteLength };
  }

  assertComplete() {
    if (this.pending) throw new Error('fact_fragment_incomplete');
  }
}
