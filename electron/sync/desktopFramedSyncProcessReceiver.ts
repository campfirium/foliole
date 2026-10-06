import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type {
  FramedSyncContext,
  PublishedTransfer,
  TransferReceiptStage
} from '../../lib/core/sync/framedSyncContract.js';
import { deriveTransferFrameKey } from '../../lib/core/sync/framedSyncCrypto.js';
import { assertTransferEnvelopeBinding } from '../../lib/core/sync/framedSyncEnvelopeContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { receiveFramedSyncFrame } from '../../lib/core/sync/framedSyncReceiver.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import type { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { DesktopFramedSyncInboundBlobSet } from './desktopFramedSyncInboundBlobSet.js';
import { DesktopFramedSyncInboundResourceStore } from './desktopFramedSyncInboundResourceStore.js';
import {
  prepareDesktopFramedSyncInbound,
  type PreparedDesktopFramedSyncInbound
} from './desktopFramedSyncPreparedInbound.js';
import {
  assertCanonicalTransferIdentity,
  headerFromWire,
  publishedFromHeader
} from './desktopFramedSyncProcessHeader.js';
import {
  admitDesktopFramedSyncTransfer,
  finishDesktopFramedSyncTransfer,
  stageDesktopFramedSyncBlob,
  stageDesktopFramedSyncFact
} from './desktopFramedSyncProcessInbound.js';
import { buildReceiptStream } from './desktopFramedSyncProcessReceipt.js';
import { wireToFact } from './desktopFramedSyncProcessWire.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

type Db = ReturnType<typeof createBetterSqliteDbPort>;
type State = {
  attemptAdmitted: boolean;
  blobs: DesktopFramedSyncInboundBlobSet | null;
  existingReceipt: TransferReceiptStage | null;
  facts: CanonicalFact[];
  published: PublishedTransfer | null;
  resources: DesktopFramedSyncInboundResourceStore | null;
};
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
  const state: State = {
    attemptAdmitted: false, blobs: null, existingReceipt: null, facts: [], published: null,
    resources: null
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
  state: State;
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
  state: State;
}) {
  const { decoded, state } = input;
  const published = state.published;
  if (!published) throw new Error('transfer_header_required');
  if (decoded.payloadCase === 'transfer_header') {
    await handleHeader(input, published);
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
    await handleBlob(input, sha256, offset, data);
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

async function handleHeader(input: Parameters<typeof handleFrame>[0], published: PublishedTransfer) {
  const header = headerFromWire(input.decoded.payload, published);
  input.state.blobs = new DesktopFramedSyncInboundBlobSet(header.blobs);
  input.state.resources = new DesktopFramedSyncInboundResourceStore({
    attemptId: input.preambleAttemptId,
    descriptors: header.blobs,
    staging: input.staging,
    transferId: published.transferId
  });
  input.state.existingReceipt = await input.staging.loadReceipt(published.transferId);
  if (!input.state.existingReceipt) await admitDesktopFramedSyncTransfer({
    attemptId: input.preambleAttemptId,
    firstFrame: input.frame,
    header,
    staging: input.staging
  });
  input.state.attemptAdmitted = !input.state.existingReceipt;
}

async function handleBlob(input: Parameters<typeof handleFrame>[0], sha256: Uint8Array,
  offset: bigint, data: Uint8Array) {
  if (input.state.blobs?.has(sha256)) {
    input.state.blobs.append(sha256, offset, data);
    await stageDesktopFramedSyncBlob({
      data, frame: input.frame, offset, sha256, staging: input.staging
    });
    return;
  }
  if (!input.state.resources?.has(sha256)) throw new Error('framed_sync_blob_content_set_mismatch');
  await input.staging.commitAuthenticatedFrame(input.frame);
  await input.state.resources.append(sha256, offset, data);
}

function receiptStream(input: Pick<Parameters<typeof handleFrame>[0], 'db' | 'groupKey' | 'staging'>,
  receipt: TransferReceiptStage) {
  return buildReceiptStream({ ...input, receipt });
}
