export const FRAMED_SYNC_PROTOCOL_VERSION = 22;

export const FRAMED_SYNC_ALGORITHMS = Object.freeze({
  aead: 'AES-256-GCM',
  compression: 'gzip',
  contentHash: 'SHA-256',
  keyDerivation: 'HKDF-SHA-256',
  nonce: '32-bit persisted random prefix + 64-bit frame sequence'
} as const);

export const FRAMED_SYNC_LIMITS = Object.freeze({
  blobChunkBytes: 512 * 1024,
  maxBlobBytes: 8 * 1024 * 1024 * 1024,
  maxBlobsPerTransfer: 4_096,
  maxChunksPerBlob: 16_384,
  maxChunksPerTransfer: 69_632,
  maxCanonicalDepth: 32,
  maxCanonicalFields: 100_000,
  maxCanonicalStringBytes: 1536 * 1024,
  maxCanonicalManifestBytes: 8 * 1024 * 1024,
  maxControlMessageBytes: 768 * 1024,
  maxDecompressedFrameBytes: 2 * 1024 * 1024,
  maxDecodedFields: 100_000,
  maxDecodedRepeatedItems: 100_000,
  maxFactsPerTransfer: 4_096,
  maxFactBlobEdges: 4_096,
  maxInFlightFrames: 4,
  maxInventoryEntries: 100_000,
  maxInventoryEntriesPerFrame: 128,
  maxInventoryFactIdsPerEntry: 100_000,
  maxSessionBytes: 64 * 1024 * 1024,
  maxSessionFrames: 16_384,
  maxManifestBytes: 768 * 1024,
  maxProtocolCapabilities: 64,
  maxProtocolStringBytes: 64 * 1024,
  maxTransferBytes: 32 * 1024 * 1024 * 1024,
  maxCiphertextBodyBytes: 2 * 1024 * 1024 + 16,
  preambleBytes: 96
} as const);

export const FRAMED_SYNC_PREAMBLE = Object.freeze({
  attemptIdBytes: 16,
  contextIdBytes: 32,
  frameHeaderBytes: 16,
  magic: 'FOLSYNC2',
  noncePrefixBytes: 4,
  sequenceBytes: 8,
  tagBytes: 16
} as const);

export const FRAMED_SYNC_KDF = Object.freeze({
  sessionInfo: 'Foliole framed sync v22 session',
  transferInfo: 'Foliole framed sync v22 transfer'
} as const);

export const FRAMED_SYNC_FRAME_TYPES = Object.freeze({
  blobChunk: 4,
  fact: 3,
  sessionControl: 1,
  transferHeader: 2,
  transferReceipt: 6,
  transferTrailer: 5
} as const);

export type FramedSyncContext = Readonly<{
  groupId: string;
  protocolVersion: typeof FRAMED_SYNC_PROTOCOL_VERSION;
  receiverDeviceId: string;
  receiverLibraryEpoch: string;
  senderDeviceId: string;
  senderLibraryEpoch: string;
}>;

export type PublishedTransfer = Readonly<{
  blobCount: bigint;
  contentId: Uint8Array;
  context: FramedSyncContext;
  factCount: bigint;
  manifestHash: Uint8Array;
  totalBlobBytes: bigint;
  transferId: Uint8Array;
}>;

export type TransferAttempt = Readonly<{
  attemptId: Uint8Array;
  noncePrefix: Uint8Array;
  preamble: Uint8Array;
  state: 'abandoned' | 'prepared' | 'replayable';
}>;

export type PreparedTransferAttempt = Omit<TransferAttempt, 'state'> & Readonly<{
  state: 'prepared';
}>;

export type StoredEncryptedFrame = Readonly<{
  ciphertext: Uint8Array;
  frameHeader: Uint8Array;
  frameType: number;
  sequence: bigint;
}>;

export type OutboundTransferStage = Readonly<{
  blobHashes: readonly Uint8Array[];
  canonicalManifest: Uint8Array;
  attempts: readonly TransferAttempt[];
  factIds: readonly string[];
  published: PublishedTransfer;
  state: 'published' | 'receipt_committed' | 'terminated';
}>;

export type InboundTransferStage = Readonly<{
  availableBlobHashes: readonly Uint8Array[];
  committedFrameSequences: readonly bigint[];
  manifest: Uint8Array;
  published: PublishedTransfer;
  stagedFactIds: readonly string[];
  state: 'receiving' | 'ready_to_apply' | 'applied';
}>;

export type TransferReceiptStage = Readonly<{
  appliedStateHash: Uint8Array;
  contentId: Uint8Array;
  receiverDeviceId: string;
  receiverLibraryEpoch: string;
  transferId: Uint8Array;
}>;

export function assertFramedSyncDigest(value: Uint8Array, name: string) {
  if (value.byteLength !== 32) throw new Error(`${name}_must_be_32_bytes`);
  return value;
}

export function assertAttemptId(value: Uint8Array) {
  if (value.byteLength !== FRAMED_SYNC_PREAMBLE.attemptIdBytes) {
    throw new Error('attempt_id_must_be_16_bytes');
  }
  return value;
}

export function assertSessionId(value: Uint8Array) {
  if (value.byteLength !== FRAMED_SYNC_PREAMBLE.attemptIdBytes) {
    throw new Error('session_id_must_be_16_bytes');
  }
  return value;
}

export function assertNoncePrefix(value: Uint8Array) {
  if (value.byteLength !== FRAMED_SYNC_PREAMBLE.noncePrefixBytes) {
    throw new Error('nonce_prefix_must_be_4_bytes');
  }
  return value;
}

export function assertFrameLengths(args: { ciphertextBytes: number; decompressedBytes: number }) {
  if (!Number.isSafeInteger(args.ciphertextBytes) || args.ciphertextBytes < 0 ||
      args.ciphertextBytes > FRAMED_SYNC_LIMITS.maxCiphertextBodyBytes) {
    throw new Error('wire_frame_limit_exceeded');
  }
  if (!Number.isSafeInteger(args.decompressedBytes) || args.decompressedBytes < 0 ||
      args.decompressedBytes > FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes) {
    throw new Error('decompressed_frame_limit_exceeded');
  }
}
