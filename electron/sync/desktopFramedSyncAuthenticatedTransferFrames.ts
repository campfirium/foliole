import type { FramedSyncContext, PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';
import { assertTransferEnvelopeBinding } from '../../lib/core/sync/framedSyncEnvelopeContract.js';
import type { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { decodeAndValidateProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { receiveFramedSyncFrame } from '../../lib/core/sync/framedSyncReceiver.js';
import type { InboundFrameInput } from '../../lib/core/sync/framedSyncStagingContract.js';

import { assertCanonicalTransferIdentity, publishedFromHeader } from './desktopFramedSyncProcessHeader.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

type TransferPreamble = Extract<ReturnType<typeof decodeFramedSyncPreamble>, { contextKind: 'transfer' }>;
export type AuthenticatedTransferFrame = Readonly<{
  published: PublishedTransfer;
  decoded: ReturnType<typeof decodeAndValidateProtocolMessage>;
  frame: InboundFrameInput;
}>;

export async function* authenticatedDesktopFramedSyncTransferFrames(input: {
  context: FramedSyncContext; key: Uint8Array; preamble: TransferPreamble;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}): AsyncGenerator<AuthenticatedTransferFrame> {
  let published: PublishedTransfer | null = null;
  let sequence = input.preamble.startingSequence;
  for await (const wire of input.stream.frames) {
    const received = await receiveFramedSyncFrame({
      ciphertext: wire.ciphertext, expectedSequence: sequence,
      frameHeader: wire.headerBytes, key: input.key, preamble: input.stream.preamble
    });
    const decoded = decodeAndValidateProtocolMessage(received.plaintext, received.frameType);
    const repeatedHeader = published !== null && decoded.payloadCase === 'transfer_header';
    if (!published) {
      if (decoded.payloadCase !== 'transfer_header') throw new Error('transfer_header_required');
      published = publishedFromHeader(decoded.payload, input.context);
    }
    if (repeatedHeader) throw new Error('transfer_header_repeated');
    assertTransferEnvelopeBinding(published, input.preamble, decoded, input.context.senderDeviceId);
    if (decoded.payloadCase === 'transfer_header') await assertCanonicalTransferIdentity(published);
    yield { published, decoded, frame: {
      attemptId: input.preamble.attemptId, authenticatedPlaintext: received.plaintext,
      ciphertext: wire.ciphertext, frameHeader: wire.headerBytes,
      frameType: received.frameType, preamble: input.stream.preamble, sequence,
      transferId: published.transferId
    } };
    sequence = received.nextSequence;
  }
}
