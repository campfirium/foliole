import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import { deriveTransferFrameKey } from '../../lib/core/sync/framedSyncCrypto.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { retireDesktopFramedSyncBodyFrame } from '../database/desktopFramedSyncBodyFrameRetirement.js';
import { retireDesktopFramedSyncResourceFrame } from '../database/desktopFramedSyncResourceFrameRetirement.js';

import { authenticatedDesktopFramedSyncTransferFrames, type AuthenticatedTransferFrame } from './desktopFramedSyncAuthenticatedTransferFrames.js';
import { assertDesktopFramedSyncFactFragmentsComplete, stageDesktopFramedSyncFactFragment } from './desktopFramedSyncFactFragments.js';
import { collectReplayedParentOrderFact, replayDesktopFramedSyncOrderBody } from './desktopFramedSyncOrderBodyReplay.js';
import { headerFromWire } from './desktopFramedSyncProcessHeader.js';
import { stageDesktopFramedSyncBlob, stageDesktopFramedSyncFact } from './desktopFramedSyncProcessInbound.js';
import { buildReceiptStream } from './desktopFramedSyncProcessReceipt.js';
import { wireToFact } from './desktopFramedSyncProcessWire.js';
import { loadDesktopFramedSyncReadySource } from './desktopFramedSyncReadySource.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';
import { applyVerifiedDesktopFramedSyncInbound } from './desktopFramedSyncVerifiedApply.js';
import { readVerifiedReceiverResourceNodes } from './desktopFramedSyncVerifiedReceiverResources.js';
import { DesktopFramedVerifiedReceiverState } from './desktopFramedSyncVerifiedReceiverState.js';

type ReceiverInput = Readonly<{
  context: FramedSyncContext; db: DbPort; groupKey: Uint8Array; staging: FramedSyncStagingPort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
  acceptHeader?: (header: ReturnType<typeof headerFromWire>) => void;
}>;
type FrameInput = ReceiverInput & { event: AuthenticatedTransferFrame; state: DesktopFramedVerifiedReceiverState };

/** Explicit candidate for ordinary receive; production activation follows owner migration. */
export async function receiveVerifiedDesktopFramedSyncTransfer(input: ReceiverInput) {
  const preamble = decodeFramedSyncPreamble(input.stream.preamble);
  if (preamble.contextKind !== 'transfer') throw new Error('transfer_preamble_required');
  const key = await deriveTransferFrameKey({
    attemptId: preamble.attemptId, groupKey: input.groupKey, transferId: preamble.contextId
  });
  const state = new DesktopFramedVerifiedReceiverState();
  try {
    for await (const event of authenticatedDesktopFramedSyncTransferFrames({ ...input, key, preamble })) {
      state.published = event.published;
      const response = await handleVerifiedFrame({ ...input, event, state });
      if (response) return response;
    }
    throw new Error('transfer_trailer_missing');
  } catch (error) {
    await state.resources?.discard();
    if (state.attemptAdmitted && state.published && !state.existingReceipt) {
      await input.staging.invalidateInboundAttempt(state.published.transferId, preamble.attemptId);
    }
    throw error;
  }
}

function handleVerifiedFrame(input: FrameInput) {
  if (input.event.decoded.payloadCase === 'transfer_trailer') return handleVerifiedTrailer(input);
  return input.db.transaction(async () => {
    const receipt = await input.staging.loadReceipt(input.event.published.transferId);
    if (receipt) {
      input.state.existingReceipt = receipt;
      input.state.ready = null;
    }
    return handleVerifiedFrameOwned(input);
  });
}

async function handleVerifiedTrailer(input: FrameInput) {
  assertDesktopFramedSyncFactFragmentsComplete(input.state);
  await input.db.transaction(async () => {
    const receipt = await input.staging.loadReceipt(input.event.published.transferId);
    if (receipt) input.state.existingReceipt = receipt;
    else if (!input.state.ready) await finishVerifiedTransfer(input);
  });
  if (input.state.existingReceipt) {
    await replayDesktopFramedSyncOrderBody({ ...input, facts: input.state.facts,
      published: input.event.published, receipt: input.state.existingReceipt, trailer: input.event.decoded.payload });
    return { ...await buildReceiptStream({ ...input, receipt: input.state.existingReceipt }), generatedChanges: false };
  }
  return applyReady(input);
}

async function handleVerifiedFrameOwned(input: FrameInput) {
  const { decoded, frame, published } = input.event;
  const { state } = input;
  if (decoded.payloadCase !== 'fact_fragment') assertDesktopFramedSyncFactFragmentsComplete(state);
  if (decoded.payloadCase === 'transfer_header') {
    input.acceptHeader?.(headerFromWire(decoded.payload, published));
    await state.admit({ db: input.db, event: input.event, staging: input.staging });
  } else if (state.ready) {
    return null;
  } else if (decoded.payloadCase === 'fact_fragment') {
    await stageDesktopFramedSyncFactFragment({ db: input.db, event: input.event, staging: input.staging, state });
  } else if (decoded.payloadCase === 'fact') {
    const fact = wireToFact(decoded.payload);
    if (state.existingReceipt) collectReplayedParentOrderFact(state.facts, published, fact);
    else {
      await stageDesktopFramedSyncFact({ fact, frame, staging: input.staging });
    }
  } else if (!state.existingReceipt && decoded.payloadCase === 'blob_chunk') {
    const sha256 = new Uint8Array(decoded.payload.blobHash as Uint8Array);
    const offset = BigInt(String(decoded.payload.offset));
    const data = decoded.payload.data as Uint8Array;
    if (state.bodies.has(bytesToHex(sha256))) {
      await stageDesktopFramedSyncBlob({ data, frame, offset, sha256, staging: input.staging });
      await retireDesktopFramedSyncBodyFrame({ db: input.db, frame, chunk: { data, offset, sha256 } });
    } else {
      if (!state.resources?.has(sha256)) throw new Error('framed_sync_blob_content_set_mismatch');
      await state.resources.append(sha256, offset, data);
      await input.db.transaction(async () => {
        await input.staging.commitAuthenticatedFrame(frame);
        await retireDesktopFramedSyncResourceFrame({ db: input.db, frame, chunk: { sha256, offset, data } });
      });
    }
  }
  return null;
}

async function finishVerifiedTransfer(input: FrameInput) {
  const { decoded, frame, published } = input.event;
  const { state, staging } = input;
  if (!state.resources || decoded.payloadCase !== 'transfer_trailer') throw new Error('transfer_payload_incomplete');
  const { nodes, resources } = await readVerifiedReceiverResourceNodes(input.db, frame.transferId, frame.attemptId);
  await staging.commitAuthenticatedFrame(frame);
  for (const descriptor of state.bodies.values()) {
    await staging.verifyAndMarkBlobAvailable(frame.transferId, frame.attemptId, descriptor.sha256);
  }
  await staging.finalizeInboundAttempt({
    attemptId: frame.attemptId, blobCount: BigInt(String(decoded.payload.blobCount)),
    factCount: BigInt(String(decoded.payload.factCount)), manifestHash: new Uint8Array(decoded.payload.manifestHash as Uint8Array),
    transferId: frame.transferId
  });
  await state.resources.complete(nodes, resources);
  await staging.markReadyToApply(frame.transferId);
  state.attemptAdmitted = false;
  state.ready = await loadDesktopFramedSyncReadySource(input.db, published);
  if (!state.ready) throw new Error('framed_sync_ready_transfer_missing');
}

async function applyReady(input: FrameInput) {
  const applied = await input.db.transaction(async () => {
    const receipt = await input.staging.loadReceipt(input.event.published.transferId);
    if (receipt) return { generatedChanges: false, receipts: [receipt] };
    const source = await loadDesktopFramedSyncReadySource(input.db, input.event.published);
    if (!source) throw new Error('framed_sync_ready_transfer_missing');
    return applyVerifiedDesktopFramedSyncInbound({ db: input.db, transfers: [source] });
  });
  const receipt = applied.receipts[0];
  if (!receipt) throw new Error('framed_sync_ready_receipt_missing');
  input.state.existingReceipt = receipt;
  return { ...await buildReceiptStream({ ...input, receipt }), generatedChanges: applied.generatedChanges };
}
