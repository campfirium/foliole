import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { FRAMED_SYNC_LIMITS, FRAMED_SYNC_PREAMBLE } from './framedSyncContract.js';
import { framedSyncInboundAttemptDirectory, framedSyncInboundDirectory,
  requireFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { decodeFrameHeader, decodeFramedSyncPreamble } from './framedSyncFraming.js';
import type { InboundFrameInput } from './framedSyncStagingContract.js';

const prefixBytes = 1 + FRAMED_SYNC_LIMITS.preambleBytes + FRAMED_SYNC_PREAMBLE.frameHeaderBytes + 32;

function frameKey(input: Pick<InboundFrameInput, 'transferId' | 'attemptId' | 'sequence'>) {
  if (input.sequence < 0n) throw new Error('framed_sync_frame_sequence_invalid');
  return `${framedSyncInboundAttemptDirectory(input.transferId, input.attemptId)}/frames/${input.sequence}.frame`;
}

function encode(input: InboundFrameInput) {
  const header = decodeFrameHeader(input.frameHeader);
  const preamble = decodeFramedSyncPreamble(input.preamble);
  if (preamble.contextKind !== 'transfer' || bytesToHex(preamble.contextId) !== bytesToHex(input.transferId) ||
      bytesToHex(preamble.attemptId) !== bytesToHex(input.attemptId) || header.frameType !== input.frameType ||
      header.sequence !== input.sequence || header.ciphertextBytes !== input.ciphertext.length ||
      input.authenticatedPlaintext.length > FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes) {
    throw new Error('inbound_frame_identity_conflict');
  }
  const result = new Uint8Array(prefixBytes + input.authenticatedPlaintext.length);
  result.set(input.preamble, 1);
  result.set(input.frameHeader, 1 + FRAMED_SYNC_LIMITS.preambleBytes);
  result.set(sha256(input.ciphertext), prefixBytes - 32);
  result.set(input.authenticatedPlaintext, prefixBytes);
  return result;
}

export async function readFramedSyncFileInboundFrame(files: FramedSyncFilePort,
  input: Pick<InboundFrameInput, 'transferId' | 'attemptId' | 'sequence'>) {
  const data = await files.read(frameKey(input));
  if (!data) return null;
  if (data.length < prefixBytes || data[0]! > 1) throw new Error('inbound_frame_file_invalid');
  const header = decodeFrameHeader(data.slice(1 + FRAMED_SYNC_LIMITS.preambleBytes, prefixBytes - 32));
  const preamble = decodeFramedSyncPreamble(data.slice(1, 1 + FRAMED_SYNC_LIMITS.preambleBytes));
  if (header.sequence !== input.sequence || preamble.contextKind !== 'transfer' ||
      bytesToHex(preamble.contextId) !== bytesToHex(input.transferId) ||
      bytesToHex(preamble.attemptId) !== bytesToHex(input.attemptId)) throw new Error('inbound_frame_identity_conflict');
  return { ...header, compacted: data[0] === 1, authenticatedPlaintext: data.slice(prefixBytes) };
}

export function createFramedSyncFileInboundFrames(files: FramedSyncFilePort) {
  return {
    async commitAuthenticatedFrame(input: InboundFrameInput) {
      const data = encode(input);
      return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
        const record = await requireFramedSyncFileInbound(files, input.transferId, input.attemptId);
        if (record.state === 'applied' || record.state === 'proposed') throw new Error('inbound_attempt_unavailable');
        const prior = await files.read(frameKey(input));
        if (prior) {
          const comparable = prior[0] === 1 ? compact(data) : data;
          if (prior.length !== comparable.length || prior.some((byte, index) => byte !== comparable[index])) {
            throw new Error('inbound_frame_identity_conflict');
          }
          return 'identical' as const;
        }
        await files.write(frameKey(input), data);
        return 'created' as const;
      });
    },
    async compactBodyFrame(input: Pick<InboundFrameInput, 'transferId' | 'attemptId' | 'sequence'>) {
      await files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
        const data = await files.read(frameKey(input));
        if (!data || data[0] === 1) return;
        const header = decodeFrameHeader(data.slice(1 + FRAMED_SYNC_LIMITS.preambleBytes, prefixBytes - 32));
        if (header.frameType !== 4) throw new Error('inbound_frame_not_body');
        await files.write(frameKey(input), compact(data));
      });
    }
  };
}

function compact(data: Uint8Array) {
  const result = new Uint8Array(prefixBytes + 32);
  result.set(data.subarray(0, prefixBytes)); result[0] = 1;
  result.set(sha256(data.subarray(prefixBytes)), prefixBytes);
  return result;
}
