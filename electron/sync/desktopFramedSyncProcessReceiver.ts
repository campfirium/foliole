import {
  canonicalTransferId,
  type CanonicalFact
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
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
import {
  admitDesktopFramedSyncTransfer,
  finishDesktopFramedSyncTransfer,
  stageDesktopFramedSyncBlob,
  stageDesktopFramedSyncFact
} from './desktopFramedSyncProcessInbound.js';
import { buildReceiptStream } from './desktopFramedSyncProcessReceipt.js';
import { wireToBlob, wireToFact } from './desktopFramedSyncProcessWire.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

type Db = ReturnType<typeof createBetterSqliteDbPort>;
type Row = Record<string, unknown>;
type State = {
  attemptAdmitted: boolean;
  blobs: DesktopFramedSyncInboundBlobSet | null;
  existingReceipt: TransferReceiptStage | null;
  facts: CanonicalFact[];
  published: PublishedTransfer | null;
};
type ReceiverInput = Readonly<{
  context: FramedSyncContext;
  db: Db;
  groupKey: Uint8Array;
  staging: FramedSyncStagingPort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}>;

const row = (value: unknown) => value as Row;
const bytes = (value: unknown) => new Uint8Array(value as Uint8Array);
const integer = (value: unknown) => BigInt(String(value));

export async function receiveDesktopFramedSyncTransfer(input: ReceiverInput) {
  const preamble = decodeFramedSyncPreamble(input.stream.preamble);
  if (preamble.contextKind !== 'transfer') throw new Error('transfer_preamble_required');
  const key = await deriveTransferFrameKey({
    attemptId: preamble.attemptId,
    groupKey: input.groupKey,
    transferId: preamble.contextId
  });
  const state: State = {
    attemptAdmitted: false, blobs: null, existingReceipt: null, facts: [], published: null
  };
  let sequence = preamble.startingSequence;
  try {
    for await (const wire of input.stream.frames) {
      const received = await receiveFramedSyncFrame({
        ciphertext: wire.ciphertext,
        expectedSequence: sequence,
        frameHeader: wire.headerBytes,
        key,
        preamble: input.stream.preamble
      });
      const decoded = decodeAndValidateProtocolMessage(received.plaintext, received.frameType);
      const repeatedHeader = state.published !== null && decoded.payloadCase === 'transfer_header';
      if (!state.published) {
        if (decoded.payloadCase !== 'transfer_header') throw new Error('transfer_header_required');
        state.published = publishedFromHeader(decoded.payload, input.context);
      }
      if (repeatedHeader) throw new Error('transfer_header_repeated');
      assertTransferEnvelopeBinding(state.published, preamble, decoded, input.context.senderDeviceId);
      if (decoded.payloadCase === 'transfer_header') await assertCanonicalTransferIdentity(state.published);
      const response = await handleFrame({
        ...input,
        decoded,
        frame: {
          attemptId: preamble.attemptId,
          authenticatedPlaintext: received.plaintext,
          ciphertext: wire.ciphertext,
          frameHeader: wire.headerBytes,
          frameType: received.frameType,
          preamble: input.stream.preamble,
          sequence,
          transferId: state.published.transferId
        },
        groupKey: input.groupKey,
        preambleAttemptId: preamble.attemptId,
        state
      });
      if (response) return response;
      sequence = received.nextSequence;
    }
  } catch (error) {
    if (state.attemptAdmitted && state.published && !state.existingReceipt) {
      await input.staging.invalidateInboundAttempt(state.published.transferId, preamble.attemptId);
    }
    throw error;
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
  staging: FramedSyncStagingPort;
  state: State;
}) {
  const { decoded, state } = input;
  const published = state.published;
  if (!published) throw new Error('transfer_header_required');
  if (decoded.payloadCase === 'transfer_header') {
    const header = headerFromWire(decoded.payload, published);
    state.blobs = new DesktopFramedSyncInboundBlobSet(header.blobs);
    state.existingReceipt = await input.staging.loadReceipt(published.transferId);
    if (!state.existingReceipt) await admitDesktopFramedSyncTransfer({
      attemptId: input.preambleAttemptId,
      firstFrame: input.frame,
      header,
      staging: input.staging
    });
    state.attemptAdmitted = !state.existingReceipt;
  } else if (state.existingReceipt && decoded.payloadCase === 'transfer_trailer') {
    return receiptStream(input, state.existingReceipt);
  } else if (!state.existingReceipt && decoded.payloadCase === 'fact') {
    const fact = wireToFact(decoded.payload);
    state.facts.push(fact);
    await stageDesktopFramedSyncFact({ fact, frame: input.frame, staging: input.staging });
  } else if (!state.existingReceipt && decoded.payloadCase === 'blob_chunk') {
    const data = bytes(decoded.payload.data);
    const offset = integer(decoded.payload.offset);
    const sha256 = bytes(decoded.payload.blobHash);
    state.blobs?.append(sha256, offset, data);
    await stageDesktopFramedSyncBlob({
      data,
      frame: input.frame,
      offset,
      sha256,
      staging: input.staging
    });
  } else if (!state.existingReceipt && decoded.payloadCase === 'transfer_trailer') {
    if (state.facts.length === 0 || !state.blobs) throw new Error('transfer_payload_incomplete');
    const receipt = await finishDesktopFramedSyncTransfer({
      blobs: state.blobs.complete(),
      blobCount: integer(decoded.payload.blobCount),
      context: input.context,
      db: input.db,
      facts: state.facts,
      factCount: integer(decoded.payload.factCount),
      frame: input.frame,
      manifestHash: bytes(decoded.payload.manifestHash),
      staging: input.staging
    });
    state.existingReceipt = receipt;
    return receiptStream(input, receipt);
  }
  return null;
}

function receiptStream(input: Pick<Parameters<typeof handleFrame>[0], 'db' | 'groupKey' | 'staging'>,
  receipt: TransferReceiptStage) {
  return buildReceiptStream({ ...input, receipt });
}

function publishedFromHeader(payload: Readonly<Record<string, unknown>>, context: FramedSyncContext) {
  const manifest = row(payload.manifest);
  const blobs = (manifest.blobs as unknown[]).map(wireToBlob);
  return {
    blobCount: BigInt(blobs.length),
    contentId: bytes(manifest.contentId),
    context,
    factCount: BigInt((manifest.facts as unknown[]).length),
    manifestHash: bytes(manifest.contentId),
    totalBlobBytes: blobs.reduce((total, blob) => total + blob.byteLength, 0n),
    transferId: bytes(payload.transferId)
  } satisfies PublishedTransfer;
}

async function assertCanonicalTransferIdentity(published: PublishedTransfer) {
  const canonical = await canonicalTransferId(published.context, published.contentId);
  const matches = canonical.byteLength === published.transferId.byteLength &&
    canonical.every((value, index) => value === published.transferId[index]);
  if (!matches) throw new Error('inbound_transfer_identity_mismatch');
}

function headerFromWire(payload: Readonly<Record<string, unknown>>, published: PublishedTransfer) {
  const manifest = row(payload.manifest);
  return {
    blobs: (manifest.blobs as unknown[]).map(wireToBlob),
    facts: (manifest.facts as unknown[]).map((value) => {
      const item = row(value);
      const identity = row(item.identity);
      return {
        factId: String(identity.factId),
        globalId: String(identity.globalId),
        kind: Number(identity.kind),
        objectType: String(identity.objectType),
        requiredBlobHashes: (item.requiredBlobHashes as unknown[]).map(bytes),
        sharedStateHash: bytes(item.sharedStateHash)
      };
    }),
    published
  };
}
