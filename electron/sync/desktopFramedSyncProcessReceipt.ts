import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import type {
  PublishedTransfer,
  StoredEncryptedFrame,
  TransferReceiptStage
} from '../../lib/core/sync/framedSyncContract.js';
import { deriveTransferFrameKey } from '../../lib/core/sync/framedSyncCrypto.js';
import { assertTransferEnvelopeBinding } from '../../lib/core/sync/framedSyncEnvelopeContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { receiveFramedSyncFrame } from '../../lib/core/sync/framedSyncReceiver.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import {
  encryptProtocolFrame,
  newTransferAttempt,
  processFrameStream,
  TRANSFER_FRAME_TYPES
} from './desktopFramedSyncProcessWire.js';
import {
  framedSyncEncodedLength,
  framedSyncEncodedSha256,
  type FramedSyncStreamBody,
  type FramedSyncWireFrame
} from './desktopFramedSyncStream.js';

const bytes = (value: unknown) => new Uint8Array(value as Uint8Array);

export async function buildReceiptStream(input: {
  db: DbPort;
  groupKey: Uint8Array;
  receipt: TransferReceiptStage;
  staging: FramedSyncStagingPort;
}) {
  const replay = await replayableReceiptAttempt(input.db, input.receipt.transferId);
  if (replay) {
    const frames = await input.staging.loadReplayableReceiptFrames(
      input.receipt.transferId,
      replay.attemptId
    );
    return receiptBody(replay.preamble, frames);
  }
  const attempt = newTransferAttempt(input.receipt.transferId);
  await input.staging.persistReceiptAttempt(input.receipt, attempt);
  const frame = await encryptProtocolFrame({
    attempt,
    frameType: TRANSFER_FRAME_TYPES.transferReceipt,
    groupKey: input.groupKey,
    payload: input.receipt,
    payloadCase: 'transfer_receipt',
    sequence: 0n,
    transferId: input.receipt.transferId
  });
  await input.staging.commitReceiptFrame(input.receipt.transferId, attempt.attemptId, frame);
  await input.staging.finalizeReceiptAttempt(input.receipt.transferId, attempt.attemptId);
  return receiptBody(attempt.preamble, [frame]);
}

function receiptBody(preamble: Uint8Array, frames: readonly StoredEncryptedFrame[]) {
  return {
    bodySha256: framedSyncEncodedSha256(preamble, frames),
    contentLength: framedSyncEncodedLength(preamble, frames),
    frames: processFrameStream(frames),
    preamble
  };
}

export async function readReceipt(input: {
  groupKey: Uint8Array;
  published: PublishedTransfer;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}) {
  const preamble = decodeFramedSyncPreamble(input.stream.preamble);
  if (preamble.contextKind !== 'transfer') throw new Error('receipt_preamble_invalid');
  const key = await deriveTransferFrameKey({
    attemptId: preamble.attemptId,
    groupKey: input.groupKey,
    transferId: input.published.transferId
  });
  for await (const wire of input.stream.frames) {
    const received = await receiveFramedSyncFrame({
      ciphertext: wire.ciphertext,
      frameHeader: wire.headerBytes,
      key,
      preamble: input.stream.preamble
    });
    const decoded = decodeAndValidateProtocolMessage(received.plaintext, received.frameType);
    assertTransferEnvelopeBinding(
      input.published,
      preamble,
      decoded,
      input.published.context.receiverDeviceId
    );
    if (decoded.payloadCase !== 'transfer_receipt') throw new Error('transfer_receipt_required');
    return {
      appliedStateHash: bytes(decoded.payload.appliedStateHash),
      contentId: bytes(decoded.payload.contentId),
      receiverDeviceId: String(decoded.payload.receiverDeviceId),
      receiverLibraryEpoch: String(decoded.payload.receiverLibraryEpoch),
      transferId: bytes(decoded.payload.transferId)
    };
  }
  throw new Error('transfer_receipt_missing');
}

async function replayableReceiptAttempt(db: DbPort, transferId: Uint8Array) {
  const rows = await db.query<DbRow>(`SELECT attempt_id, preamble FROM framed_sync_outbound_attempts
    WHERE transfer_id = ? AND purpose = 'receipt' AND state = 'replayable' ORDER BY rowid DESC LIMIT 1`,
  [transferId]);
  const attempt = rows[0];
  return attempt ? { attemptId: bytes(attempt.attempt_id), preamble: bytes(attempt.preamble) } : null;
}
