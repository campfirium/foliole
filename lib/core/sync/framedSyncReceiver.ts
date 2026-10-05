import {
  assertFrameLengths,
  FRAMED_SYNC_FRAME_TYPES,
  FRAMED_SYNC_LIMITS
} from './framedSyncContract.js';
import { decryptFrame } from './framedSyncCrypto.js';
import {
  decodeFrameHeader,
  decodeFramedSyncPreamble,
  frameAad,
  frameNonce
} from './framedSyncFraming.js';

export type ProtocolPayloadCase =
  | 'blob_chunk' | 'blob_offer' | 'difference_request' | 'error' | 'fact'
  | 'handshake' | 'handshake_acceptance' | 'inventory_begin' | 'inventory_chunk'
  | 'inventory_end' | 'missing_blob_set' | 'round_receipt' | 'transfer_header'
  | 'transfer_proposal' | 'transfer_receipt' | 'transfer_termination' | 'transfer_trailer';

const SESSION_PAYLOADS = new Set<ProtocolPayloadCase>([
  'blob_offer', 'difference_request', 'error', 'handshake', 'handshake_acceptance',
  'inventory_begin', 'inventory_chunk', 'inventory_end', 'missing_blob_set',
  'round_receipt', 'transfer_proposal', 'transfer_termination'
]);

export function frameTypeForPayload(payload: ProtocolPayloadCase) {
  if (SESSION_PAYLOADS.has(payload)) return FRAMED_SYNC_FRAME_TYPES.sessionControl;
  if (payload === 'transfer_header') return FRAMED_SYNC_FRAME_TYPES.transferHeader;
  if (payload === 'fact') return FRAMED_SYNC_FRAME_TYPES.fact;
  if (payload === 'blob_chunk') return FRAMED_SYNC_FRAME_TYPES.blobChunk;
  if (payload === 'transfer_trailer') return FRAMED_SYNC_FRAME_TYPES.transferTrailer;
  if (payload === 'transfer_receipt') return FRAMED_SYNC_FRAME_TYPES.transferReceipt;
  throw new Error('protocol_payload_case_invalid');
}

export type GzipChunkDecoder = (
  compressed: Uint8Array,
  maxBytes: number
) => AsyncIterable<Uint8Array>;

export async function collectDecompressedChunks(
  chunks: AsyncIterable<Uint8Array>,
  maxBytes = FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes
) {
  const accepted: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error('decompressed_frame_limit_exceeded');
    accepted.push(chunk);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of accepted) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function assertContextFrameType(contextKind: 'session' | 'transfer', frameType: number) {
  if (contextKind === 'session' && frameType !== FRAMED_SYNC_FRAME_TYPES.sessionControl) {
    throw new Error('session_frame_type_invalid');
  }
  if (contextKind === 'transfer' &&
      (frameType < FRAMED_SYNC_FRAME_TYPES.transferHeader ||
       frameType > FRAMED_SYNC_FRAME_TYPES.transferReceipt)) {
    throw new Error('transfer_frame_type_invalid');
  }
}

export function assertDecodedFrameType(authenticatedType: number, decodedType: number) {
  if (authenticatedType !== decodedType) throw new Error('frame_payload_type_mismatch');
}

export function assertDecodedPayloadType(authenticatedType: number, payload: ProtocolPayloadCase) {
  assertDecodedFrameType(authenticatedType, frameTypeForPayload(payload));
}

export function assertFramePayloadBudget(frameType: number, plaintextBytes: number) {
  const limit = frameType === FRAMED_SYNC_FRAME_TYPES.sessionControl
    ? FRAMED_SYNC_LIMITS.maxControlMessageBytes
    : frameType === FRAMED_SYNC_FRAME_TYPES.transferHeader
      ? FRAMED_SYNC_LIMITS.maxManifestBytes
      : FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes;
  if (plaintextBytes > limit) throw new Error('frame_payload_limit_exceeded');
}

export async function receiveFramedSyncFrame(args: {
  ciphertext: Uint8Array;
  decompressGzip?: GzipChunkDecoder;
  expectedSequence?: bigint;
  frameHeader: Uint8Array;
  key: Uint8Array;
  preamble: Uint8Array;
}) {
  const preamble = decodeFramedSyncPreamble(args.preamble);
  const header = decodeFrameHeader(args.frameHeader);
  assertContextFrameType(preamble.contextKind, header.frameType);
  const expectedSequence = args.expectedSequence ?? preamble.startingSequence;
  if (header.sequence !== expectedSequence) throw new Error('frame_sequence_not_contiguous');
  if (header.ciphertextBytes !== args.ciphertext.byteLength) throw new Error('frame_length_mismatch');
  if (header.sequence === 0xffff_ffff_ffff_ffffn) throw new Error('frame_sequence_exhausted');
  const compressed = await decryptFrame({
    aad: frameAad(args.preamble, args.frameHeader), ciphertext: args.ciphertext,
    key: args.key, nonce: frameNonce(preamble.noncePrefix, header.sequence)
  });
  if (preamble.compression === 'gzip' && !args.decompressGzip) {
    throw new Error('gzip_decoder_required');
  }
  const plaintext = preamble.compression === 'gzip'
    ? await collectDecompressedChunks(
      args.decompressGzip!(compressed, FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes)
    )
    : compressed;
  assertFrameLengths({
    ciphertextBytes: args.ciphertext.byteLength,
    decompressedBytes: plaintext.byteLength
  });
  assertFramePayloadBudget(header.frameType, plaintext.byteLength);
  return { frameType: header.frameType, nextSequence: header.sequence + 1n, plaintext };
}
