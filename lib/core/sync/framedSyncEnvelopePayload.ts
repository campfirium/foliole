import type { PublishedTransfer } from './framedSyncContract.js';
import type { ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';

type TransferIdentity = Readonly<{ transferId: Uint8Array }>;

export type TransferBoundPayload =
  | (TransferIdentity & Readonly<{ case: 'blob_chunk' | 'fact' }>)
  | (TransferIdentity & Readonly<{
    attemptId: Uint8Array; blobCount: bigint; case: 'header'; contentId: Uint8Array;
    factCount: bigint; groupId: string; protocolVersion: number; totalBlobBytes: bigint;
  }>)
  | (TransferIdentity & Readonly<{
    blobCount: bigint; case: 'trailer'; factCount: bigint; manifestHash: Uint8Array;
  }>)
  | (TransferIdentity & Readonly<{
    appliedStateHash: Uint8Array; case: 'receipt'; contentId: Uint8Array;
    receiverDeviceId: string; receiverLibraryEpoch: string;
  }>);

export type SessionBoundPayload =
  | Readonly<{ case: 'control' }>
  | Readonly<{
    case: 'handshake'; deviceId: string; groupId: string; libraryEpoch: string;
    protocolVersion: number; sessionId: Uint8Array;
  }>
  | Readonly<{ case: 'handshake_acceptance'; protocolVersion: number; sessionId: Uint8Array }>
  | (TransferIdentity & Readonly<{ case: 'blob_offer' | 'missing_blob_set' }>)
  | (TransferIdentity & Readonly<{
    acknowledged: boolean; case: 'transfer_termination'; memberId: string;
  }>)
  | Readonly<{ case: 'protocol_error'; code: number; message: string; transferId: Uint8Array | null }>
  | (TransferIdentity & Readonly<{
    blobCount: bigint; case: 'proposal'; contentId: Uint8Array; factCount: bigint;
    receiverDeviceId: string; receiverLibraryEpoch: string; senderDeviceId: string;
    senderLibraryEpoch: string; totalBlobBytes: bigint;
  }>);

const TRANSFER_CASES = new Set([
  'blob_chunk', 'fact', 'transfer_header', 'transfer_receipt', 'transfer_trailer'
]);

const bytes = (value: unknown) => value as Uint8Array;
const count = (value: unknown) => BigInt(value as string | number | bigint);

export function isTransferPayloadCase(payloadCase: string) {
  return TRANSFER_CASES.has(payloadCase);
}

export function transferPayload(
  message: ValidatedProtocolMessage,
  published: PublishedTransfer
): TransferBoundPayload {
  const payload = message.payload;
  if (message.payloadCase === 'fact') return { case: 'fact', transferId: published.transferId };
  if (message.payloadCase === 'blob_chunk') {
    return { case: 'blob_chunk', transferId: bytes(payload.transferId) };
  }
  if (message.payloadCase === 'transfer_trailer') return {
    blobCount: count(payload.blobCount), case: 'trailer', factCount: count(payload.factCount),
    manifestHash: bytes(payload.manifestHash), transferId: bytes(payload.transferId)
  };
  if (message.payloadCase === 'transfer_receipt') return {
    appliedStateHash: bytes(payload.appliedStateHash), case: 'receipt',
    contentId: bytes(payload.contentId), receiverDeviceId: String(payload.receiverDeviceId),
    receiverLibraryEpoch: String(payload.receiverLibraryEpoch), transferId: bytes(payload.transferId)
  };
  if (message.payloadCase !== 'transfer_header') throw new Error('transfer_payload_required');
  const manifest = payload.manifest as Record<string, unknown>;
  const blobs = manifest.blobs as readonly Record<string, unknown>[];
  const facts = manifest.facts as readonly unknown[];
  return {
    attemptId: bytes(payload.attemptId), blobCount: BigInt(blobs.length), case: 'header',
    contentId: bytes(manifest.contentId), factCount: BigInt(facts.length),
    groupId: String(manifest.groupId), protocolVersion: Number(manifest.protocolVersion),
    totalBlobBytes: blobs.reduce((total, blob) => total + count(blob.byteLength), 0n),
    transferId: bytes(payload.transferId)
  };
}

export function sessionPayload(message: ValidatedProtocolMessage): SessionBoundPayload {
  const payload = message.payload;
  if (message.payloadCase === 'handshake') return {
    case: 'handshake', deviceId: String(payload.deviceId), groupId: String(payload.groupId),
    libraryEpoch: String(payload.libraryEpoch), protocolVersion: Number(payload.protocolVersion),
    sessionId: bytes(payload.sessionId)
  };
  if (message.payloadCase === 'handshake_acceptance') return {
    case: 'handshake_acceptance', protocolVersion: Number(payload.protocolVersion),
    sessionId: bytes(payload.sessionId)
  };
  if (message.payloadCase === 'transfer_proposal') return {
    blobCount: count(payload.blobCount), case: 'proposal', contentId: bytes(payload.contentId),
    factCount: count(payload.factCount), receiverDeviceId: String(payload.receiverDeviceId),
    receiverLibraryEpoch: String(payload.receiverLibraryEpoch),
    senderDeviceId: String(payload.senderDeviceId), senderLibraryEpoch: String(payload.senderLibraryEpoch),
    totalBlobBytes: count(payload.totalBlobBytes), transferId: bytes(payload.transferId)
  };
  if (message.payloadCase === 'blob_offer' || message.payloadCase === 'missing_blob_set') {
    return { case: message.payloadCase, transferId: bytes(payload.transferId) };
  }
  if (message.payloadCase === 'transfer_termination') return {
    acknowledged: Boolean(payload.acknowledged), case: 'transfer_termination',
    memberId: String(payload.memberId), transferId: bytes(payload.transferId)
  };
  if (message.payloadCase === 'error') return {
    case: 'protocol_error', code: Number(payload.code), message: String(payload.message),
    transferId: bytes(payload.transferId).byteLength === 0 ? null : bytes(payload.transferId)
  };
  return { case: 'control' };
}
