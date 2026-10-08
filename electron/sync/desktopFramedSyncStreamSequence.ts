import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS, FRAMED_SYNC_PREAMBLE } from '../../lib/core/sync/framedSyncContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';

import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';
import { FramedSyncExactByteReader, type FramedSyncBinaryChunk } from './framedSyncExactByteReader.js';
import { readFramedSyncWireFrames } from './framedSyncWireFrameReader.js';

/** Only framing boundaries are recognized here. Each unit's existing consumer authenticates its envelope and trailer. */
export async function* readFramedSyncStreamSequence(source: AsyncIterable<FramedSyncBinaryChunk>,
  payloadBudget?: FramedSyncPayloadBudget): AsyncGenerator<FramedSyncStreamBody<FramedSyncWireFrame>> {
  const reader = new FramedSyncExactByteReader(source[Symbol.asyncIterator]());
  const state: SequenceState = { items: 0, messageBytes: 0, compressed: false, firstType: undefined };
  try {
    for (;;) {
      const preamble = await reader.read(FRAMED_SYNC_LIMITS.preambleBytes, 'framed_sync_preamble_truncated', true);
      if (!preamble) {
        if (!state.items) throw new Error('framed_sync_preamble_truncated');
        return;
      }
      const decoded = decodeFramedSyncPreamble(preamble);
      if (++state.items > FRAMED_SYNC_BATCH_LIMITS.maxItems) throw new Error('framed_sync_batch_item_limit_exceeded');
      state.messageBytes += preamble.byteLength;
      state.compressed ||= decoded.compression !== 'none';
      if (state.items > 1 && (state.compressed || state.messageBytes > FRAMED_SYNC_BATCH_LIMITS.maxMessageBytes)) {
        throw new Error('framed_sync_batch_message_limit_exceeded');
      }
      if (decoded.contextKind === 'session') {
        if (state.items !== 1) throw new Error('framed_sync_batch_transfer_required');
        const frames = readFramedSyncWireFrames({ reader, payloadBudget, reuseCiphertext: true });
        try { yield { preamble, frames }; }
        finally { await frames.return(undefined); }
        if (await reader.read(1, 'framed_sync_session_tail_invalid', true)) {
          throw new Error('framed_sync_session_not_consumed');
        }
        return;
      }
      const { frames, isTerminal } = transferFrames(reader, state, payloadBudget);
      try { yield { preamble, frames }; }
      finally { await frames.return(undefined); }
      if (!isTerminal()) throw new Error('framed_sync_transfer_not_consumed');
    }
  } finally { await reader.close(); }
}

type SequenceState = {
  items: number;
  messageBytes: number;
  compressed: boolean;
  firstType: number | undefined;
};

function transferFrames(reader: FramedSyncExactByteReader, state: SequenceState,
  payloadBudget?: FramedSyncPayloadBudget) {
  let terminal = false;
  let frameCount = 0;
  const frames = readFramedSyncWireFrames({ reader, payloadBudget, reuseCiphertext: true,
    beforeBody: (header) => {
      if (header.ciphertextBytes < FRAMED_SYNC_PREAMBLE.tagBytes) throw new Error('framed_sync_frame_body_length_mismatch');
      if (frameCount++ === 0) {
        if (header.frameType !== FRAMED_SYNC_FRAME_TYPES.transferHeader &&
            header.frameType !== FRAMED_SYNC_FRAME_TYPES.transferReceipt) throw new Error('transfer_header_required');
        state.firstType ??= header.frameType;
        if (state.firstType !== header.frameType) throw new Error('framed_sync_batch_kind_mismatch');
      }
      if (header.frameType === FRAMED_SYNC_FRAME_TYPES.transferReceipt && frameCount !== 1) {
        throw new Error('transfer_receipt_required');
      }
      state.messageBytes += header.ciphertextBytes - FRAMED_SYNC_PREAMBLE.tagBytes;
      if (state.items > 1 && state.messageBytes > FRAMED_SYNC_BATCH_LIMITS.maxMessageBytes) {
        throw new Error('framed_sync_batch_message_limit_exceeded');
      }
    },
    terminal: (header) => {
      terminal = header.frameType === FRAMED_SYNC_FRAME_TYPES.transferTrailer ||
        header.frameType === FRAMED_SYNC_FRAME_TYPES.transferReceipt;
      return terminal;
    }
  });
  return { frames, isTerminal: () => terminal };
}
