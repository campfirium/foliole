import type { FramedSyncWireFrame } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_PREAMBLE } from './framedSyncContract.js';
import type { FramedSyncExactByteReader } from './framedSyncExactByteReader.js';
import { decodeFrameHeader, type FramedSyncFrameHeader } from './framedSyncFraming.js';
import { FRAMED_SYNC_PAYLOAD_SLOT_BYTES, FRAMED_SYNC_RECEIPT_SLOT_BYTES,
  type FramedSyncPayloadBudget } from './framedSyncPayloadBudget.js';

export async function* readFramedSyncWireFrames(input: {
  reader: FramedSyncExactByteReader;
  payloadBudget?: FramedSyncPayloadBudget | undefined;
  reuseCiphertext?: boolean;
  beforeBody?: (header: FramedSyncFrameHeader) => void;
  terminal?: (header: FramedSyncFrameHeader) => boolean;
}): AsyncGenerator<FramedSyncWireFrame> {
  let buffer = new Uint8Array(0);
  for (;;) {
    const headerBytes = await input.reader.read(FRAMED_SYNC_PREAMBLE.frameHeaderBytes,
      'framed_sync_frame_header_truncated', true);
    if (!headerBytes) return;
    const header = decodeFrameHeader(headerBytes);
    input.beforeBody?.(header);
    const receipt = header.frameType === FRAMED_SYNC_FRAME_TYPES.transferReceipt;
    if (receipt && header.ciphertextBytes > FRAMED_SYNC_RECEIPT_SLOT_BYTES) {
      throw new Error('framed_sync_receipt_frame_limit_exceeded');
    }
    const lease = receipt
      ? await input.payloadBudget?.acquireReceipt({ direction: 'inbound', bytes: FRAMED_SYNC_RECEIPT_SLOT_BYTES })
      : await input.payloadBudget?.acquire({ direction: 'inbound', bytes: FRAMED_SYNC_PAYLOAD_SLOT_BYTES });
    try {
      if (input.reuseCiphertext && buffer.byteLength < header.ciphertextBytes) buffer = new Uint8Array(header.ciphertextBytes);
      const ciphertext = await input.reader.read(header.ciphertextBytes, 'framed_sync_frame_body_truncated',
        false, input.reuseCiphertext ? buffer : undefined);
      const terminal = input.terminal?.(header) === true;
      yield { ciphertext, header, headerBytes };
      if (terminal) return;
    } finally { lease?.release(); }
  }
}
