import type {
  FramedSyncContext,
  TransferReceiptStage
} from '../../lib/core/sync/framedSyncContract.js';
import { deriveTransferFrameKey } from '../../lib/core/sync/framedSyncCrypto.js';
import { assertTransferEnvelopeBinding } from '../../lib/core/sync/framedSyncEnvelopeContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { receiveFramedSyncFrame } from '../../lib/core/sync/framedSyncReceiver.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import type { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { applyPreparedDesktopFramedSyncInbound } from './desktopFramedSyncApplyPrepared.js';
import {
  prepareDesktopFramedSyncInbound,
  type PreparedDesktopFramedSyncInbound
} from './desktopFramedSyncPreparedInbound.js';
import {
  assertCanonicalTransferIdentity,
  publishedFromHeader
} from './desktopFramedSyncProcessHeader.js';
import {
  finishDesktopFramedSyncTransfer,
  stageDesktopFramedSyncFact
} from './desktopFramedSyncProcessInbound.js';
import { buildReceiptStream } from './desktopFramedSyncProcessReceipt.js';
import { wireToFact } from './desktopFramedSyncProcessWire.js';
import { handleDesktopFramedSyncReceiverHeader, handleDesktopFramedSyncReceiverBlob, type DesktopFramedSyncReceiverState }
  from './desktopFramedSyncReceiverHeader.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

type Db = ReturnType<typeof createBetterSqliteDbPort>;
type ReceiverInput = Readonly<{
  context: FramedSyncContext;
  db: Db;
  groupKey: Uint8Array;
  staging: FramedSyncStagingPort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}>;

const bytes = (value: unknown) => new Uint8Array(value as Uint8Array);
const integer = (value: unknown) => BigInt(String(value));

type ReceiptBody = Awaited<ReturnType<typeof buildReceiptStream>> & {
  generatedChanges?: boolean;
};
type FinishResult = ReceiptBody | PreparedDesktopFramedSyncInbound;
type TransferPreamble = Extract<
  ReturnType<typeof decodeFramedSyncPreamble>,
  { contextKind: 'transfer' }
>;

export function receiveDesktopFramedSyncTransfer(input: ReceiverInput): Promise<ReceiptBody> {
  return processDesktopFramedSyncTransfer(input, false) as Promise<ReceiptBody>;
}

export function stageDesktopFramedSyncTransfer(
  input: ReceiverInput
): Promise<PreparedDesktopFramedSyncInbound> {
  return processDesktopFramedSyncTransfer(input, true) as Promise<PreparedDesktopFramedSyncInbound>;
}

async function processDesktopFramedSyncTransfer(
  input: ReceiverInput,
  stageOnly: boolean
): Promise<FinishResult> {
  const preamble = decodeFramedSyncPreamble(input.stream.preamble);
  if (preamble.contextKind !== 'transfer') throw new Error('transfer_preamble_required');
  const key = await deriveTransferFrameKey({
    attemptId: preamble.attemptId,
    groupKey: input.groupKey,
    transferId: preamble.contextId
  });
  const state: DesktopFramedSyncReceiverState = {
    attemptAdmitted: false, blobs: null, existingReceipt: null, facts: [], published: null,
    resources: null, ready: null
  };
  try {
    return await consumeTransferFrames({
      input, key, preamble, sequence: preamble.startingSequence, stageOnly, state
    });
  } catch (error) {
    await state.resources?.discard();
    if (state.attemptAdmitted && state.published && !state.existingReceipt) {
      await input.staging.invalidateInboundAttempt(state.published.transferId, preamble.attemptId);
    }
    throw error;
  }
}

async function consumeTransferFrames(args: {
  input: ReceiverInput;
  key: Uint8Array;
  preamble: TransferPreamble;
  sequence: bigint;
  stageOnly: boolean;
  state: DesktopFramedSyncReceiverState;
}): Promise<FinishResult> {
  let sequence = args.sequence;
  for await (const wire of args.input.stream.frames) {
    const received = await receiveFramedSyncFrame({
      ciphertext: wire.ciphertext, expectedSequence: sequence,
      frameHeader: wire.headerBytes, key: args.key, preamble: args.input.stream.preamble
    });
    const decoded = decodeAndValidateProtocolMessage(received.plaintext, received.frameType);
    const repeatedHeader = args.state.published !== null && decoded.payloadCase === 'transfer_header';
    if (!args.state.published) {
      if (decoded.payloadCase !== 'transfer_header') throw new Error('transfer_header_required');
      args.state.published = publishedFromHeader(decoded.payload, args.input.context);
    }
    if (repeatedHeader) throw new Error('transfer_header_repeated');
    assertTransferEnvelopeBinding(
      args.state.published, args.preamble, decoded, args.input.context.senderDeviceId
    );
    if (decoded.payloadCase === 'transfer_header') {
      await assertCanonicalTransferIdentity(args.state.published);
    }
    const response = await handleFrame({
      ...args.input,
      decoded,
      frame: {
        attemptId: args.preamble.attemptId, authenticatedPlaintext: received.plaintext,
        ciphertext: wire.ciphertext, frameHeader: wire.headerBytes,
        frameType: received.frameType, preamble: args.input.stream.preamble, sequence,
        transferId: args.state.published.transferId
      },
      groupKey: args.input.groupKey,
      preambleAttemptId: args.preamble.attemptId,
      stageOnly: args.stageOnly,
      state: args.state
    });
    if (response) return response;
    sequence = received.nextSequence;
  }
  throw new Error('transfer_trailer_missing');
}

async function handleFrame(input: {
  context: FramedSyncContext;
  db: Db;
  decoded: ReturnType<typeof decodeAndValidateProtocolMessage>;
  frame: Parameters<typeof stageDesktopFramedSyncFact>[0]['frame'];
  groupKey: Uint8Array;
  preambleAttemptId: Uint8Array;
  stageOnly: boolean;
  staging: FramedSyncStagingPort;
  state: DesktopFramedSyncReceiverState;
}) {
  const { decoded, state } = input;
  const published = state.published;
  if (!published) throw new Error('transfer_header_required');
  if (decoded.payloadCase === 'transfer_header') {
    await handleDesktopFramedSyncReceiverHeader(input, published);
  } else if (state.ready) {
    if (decoded.payloadCase !== 'transfer_trailer') return null;
    return applyReadyTransfer(input, state.ready);
  } else if (state.existingReceipt && decoded.payloadCase === 'transfer_trailer') {
    if (input.stageOnly) throw new Error('framed_sync_restore_transfer_already_applied');
    return receiptStream(input, state.existingReceipt);
  } else if (!state.existingReceipt && decoded.payloadCase === 'fact') {
    const fact = wireToFact(decoded.payload);
    state.facts.push(fact);
    await stageDesktopFramedSyncFact({ fact, frame: input.frame, staging: input.staging });
  } else if (!state.existingReceipt && decoded.payloadCase === 'blob_chunk') {
    const data = bytes(decoded.payload.data);
    const offset = integer(decoded.payload.offset);
    const sha256 = bytes(decoded.payload.blobHash);
    await handleDesktopFramedSyncReceiverBlob(input, sha256, offset, data);
  } else if (!state.existingReceipt && decoded.payloadCase === 'transfer_trailer') {
    if (state.facts.length === 0 || !state.blobs || !state.resources) {
      throw new Error('transfer_payload_incomplete');
    }
    const preparedInput = {
      blobs: state.blobs.complete(),
      blobCount: integer(decoded.payload.blobCount),
      context: input.context,
      db: input.db,
      facts: state.facts,
      factCount: integer(decoded.payload.factCount),
      frame: input.frame,
      manifestHash: bytes(decoded.payload.manifestHash),
      resources: state.resources,
      staging: input.staging
    };
    if (input.stageOnly) return prepareDesktopFramedSyncInbound(preparedInput);
    const applied = await finishDesktopFramedSyncTransfer(preparedInput);
    state.existingReceipt = applied.receipt;
    return {
      ...await receiptStream(input, applied.receipt),
      generatedChanges: applied.generatedChanges
    };
  }
  return null;
}

function receiptStream(input: Pick<Parameters<typeof handleFrame>[0], 'db' | 'groupKey' | 'staging'>,
  receipt: TransferReceiptStage) {
  return buildReceiptStream({ ...input, receipt });
}

async function applyReadyTransfer(input: Parameters<typeof handleFrame>[0],
  ready: PreparedDesktopFramedSyncInbound) {
  if (input.stageOnly) return ready;
  const applied = await applyPreparedDesktopFramedSyncInbound({ db: input.db, transfers: [ready] });
  const receipt = applied.receipts[0];
  if (!receipt) throw new Error('framed_sync_ready_receipt_missing');
  input.state.existingReceipt = receipt;
  return { ...await receiptStream(input, receipt), generatedChanges: applied.generatedChanges };
}
