import type {
  FramedSyncContext,
  TransferReceiptStage
} from '../../lib/core/sync/framedSyncContract.js';
import { deriveTransferFrameKey } from '../../lib/core/sync/framedSyncCrypto.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import type { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { applyPreparedDesktopFramedSyncInbound } from './desktopFramedSyncApplyPrepared.js';
import { authenticatedDesktopFramedSyncTransferFrames } from './desktopFramedSyncAuthenticatedTransferFrames.js';
import { collectReplayedParentOrderFact, replayDesktopFramedSyncOrderBody } from './desktopFramedSyncOrderBodyReplay.js';
import {
  prepareDesktopFramedSyncInbound,
  type PreparedDesktopFramedSyncInbound
} from './desktopFramedSyncPreparedInbound.js';
import {
  stageDesktopFramedSyncFact
} from './desktopFramedSyncProcessInbound.js';
import { buildReceiptStream } from './desktopFramedSyncProcessReceipt.js';
import { wireToFact } from './desktopFramedSyncProcessWire.js';
import { handleDesktopFramedSyncReceiverHeader, handleDesktopFramedSyncReceiverBlob, type DesktopFramedSyncReceiverState }
  from './desktopFramedSyncReceiverHeader.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';
import { receiveVerifiedDesktopFramedSyncTransfer } from './desktopFramedSyncVerifiedReceiver.js';

type Db = ReturnType<typeof createBetterSqliteDbPort>;
type ReceiverInput = Readonly<{
  context: FramedSyncContext;
  db: Db;
  groupKey: Uint8Array;
  staging: FramedSyncStagingPort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
  acceptHeader?: NonNullable<Parameters<typeof receiveVerifiedDesktopFramedSyncTransfer>[0]['acceptHeader']>;
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
  return receiveVerifiedDesktopFramedSyncTransfer(input);
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
  for await (const event of authenticatedDesktopFramedSyncTransferFrames({
    context: args.input.context, key: args.key, preamble: args.preamble, stream: args.input.stream
  })) {
    args.state.published = event.published;
    const response = await handleFrame({
      ...args.input, decoded: event.decoded, frame: event.frame,
      preambleAttemptId: args.preamble.attemptId, stageOnly: args.stageOnly, state: args.state
    });
    if (response) return response;
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
    await replayDesktopFramedSyncOrderBody({ db: input.db, facts: state.facts, published,
      receipt: state.existingReceipt, trailer: decoded.payload });
    return receiptStream(input, state.existingReceipt);
  } else if (state.existingReceipt && decoded.payloadCase === 'fact') {
    collectReplayedParentOrderFact(state.facts, published, wireToFact(decoded.payload));
  } else if (!state.existingReceipt && decoded.payloadCase === 'fact') {
    const fact = wireToFact(decoded.payload);
    state.facts.push(fact);
    await stageDesktopFramedSyncFact({ fact, frame: input.frame, staging: input.staging });
  } else if (!state.existingReceipt && decoded.payloadCase === 'blob_chunk') {
    await handleDesktopFramedSyncReceiverBlob(input, bytes(decoded.payload.blobHash),
      integer(decoded.payload.offset), bytes(decoded.payload.data));
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
    const ready = await prepareDesktopFramedSyncInbound(preparedInput);
    state.ready = ready;
    state.attemptAdmitted = false;
    return applyReadyTransfer(input, ready);
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
