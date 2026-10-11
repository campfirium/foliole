import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { FramedSyncFactFragmentDecoder } from './framedSyncFactFrameReader.js';
import { readFramedSyncFileInboundFrame } from './framedSyncFileInboundFrames.js';
import { framedSyncInboundAttemptDirectory } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { decodeAndValidateProtocolMessage } from './framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from './framedSyncWireFact.js';

type Identity = Readonly<{ transferId: Uint8Array; attemptId: Uint8Array }>;

export async function readFramedSyncFileFact(files: FramedSyncFilePort, identity: Identity, firstSequence: bigint) {
  let decoder: FramedSyncFactFragmentDecoder | undefined;
  for (let sequence = firstSequence; ; sequence += 1n) {
    const frame = await readFramedSyncFileInboundFrame(files, { ...identity, sequence });
    if (!frame || frame.frameType !== FRAMED_SYNC_FRAME_TYPES.fact || frame.compacted) throw new Error('fact_fragment_incomplete');
    if (frame.authenticatedPlaintext.length > FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes) throw new Error('frame_payload_limit_exceeded');
    const message = decodeAndValidateProtocolMessage(frame.authenticatedPlaintext, frame.frameType);
    if (!decoder && message.payloadCase === 'fact') return { fact: canonicalFactFromValidatedMessage(message), lastSequence: sequence };
    decoder ??= new FramedSyncFactFragmentDecoder();
    const decoded = decoder.accept(message, sequence);
    if (decoded) return { fact: canonicalFactFromValidatedMessage(decoded.message), lastSequence: decoded.lastSequence };
  }
}

export async function* streamFramedSyncFileFacts(files: FramedSyncFilePort, identity: Identity):
AsyncIterable<{ sequence: bigint; fact: CanonicalFact }> {
  const directory = `${framedSyncInboundAttemptDirectory(identity.transferId, identity.attemptId)}/frames`;
  const sequences = (await files.list(directory)).map((name) => {
    if (!/^(0|[1-9]\d*)\.frame$/u.test(name)) throw new Error('inbound_frame_file_invalid');
    return BigInt(name.slice(0, -6));
  }).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  let after = -1n;
  for (const sequence of sequences) {
    if (sequence <= after) continue;
    const frame = await readFramedSyncFileInboundFrame(files, { ...identity, sequence });
    if (!frame) throw new Error('inbound_frame_file_missing');
    if (frame.frameType !== FRAMED_SYNC_FRAME_TYPES.fact) continue;
    const result = await readFramedSyncFileFact(files, identity, sequence);
    after = result.lastSequence;
    yield { sequence, fact: result.fact };
  }
}
