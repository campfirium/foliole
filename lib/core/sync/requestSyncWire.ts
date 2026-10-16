import { deriveSessionFrameKey, encryptFrame, importFrameKey } from './framedSyncCrypto.js';
import { decodeFramedSyncPreamble, encodeFrameHeader, encodeFramedSyncPreamble, frameAad, frameNonce } from './framedSyncFraming.js';
import { decodeAndValidateProtocolMessage } from './framedSyncProtocolCodec.js';
import { assertFramePayloadBudget, frameTypeForPayload, receiveFramedSyncRequestFrame } from './framedSyncReceiver.js';
import { assertAuthenticatedSessionBootstrap, deriveSessionContextId,
  type FramedSyncSessionContext } from './framedSyncSession.js';
import { encodeRequestSyncMessage, type RequestSyncMessage } from './requestSyncObjectMessages.js';
import type { RequestSyncDecodedMessage } from './requestSyncObjectReceiver.js';

export type RequestSyncAuthenticatedContext = Omit<FramedSyncSessionContext, 'sessionId'>;
export type RequestSyncWireFrame = Readonly<{ headerBytes: Uint8Array; ciphertext: Uint8Array }>;

/** Each one-shot stream uses fresh random key material; crashes abandon it instead of resuming a nonce sequence. */
export async function prepareRequestSyncWire(input: {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  messages(contextId: Uint8Array): AsyncIterable<RequestSyncMessage>;
  signal?: AbortSignal;
}) {
  input.signal?.throwIfAborted();
  const sessionId = crypto.getRandomValues(new Uint8Array(16));
  const noncePrefix = crypto.getRandomValues(new Uint8Array(4));
  const contextId = await deriveSessionContextId({ ...input.context, sessionId });
  const preamble = encodeFramedSyncPreamble({ compression: 'none', contextId, contextKind: 'session',
    noncePrefix, sessionId, startingSequence: 0n });
  const key = await importFrameKey(await deriveSessionFrameKey({ groupKey: input.groupKey, sessionContextId: contextId, sessionId }), 'encrypt');
  const frames = (async function* (): AsyncGenerator<RequestSyncWireFrame> {
    let sequence = 0n;
    for await (const message of input.messages(contextId)) {
      input.signal?.throwIfAborted();
      if (sequence === 0xffff_ffff_ffff_ffffn) throw new Error('frame_sequence_exhausted');
      const plaintext = encodeRequestSyncMessage(message);
      const frameType = frameTypeForPayload(message.payloadCase);
      assertFramePayloadBudget(frameType, plaintext.length);
      const headerBytes = encodeFrameHeader({ frameType, flags: 0, sequence, ciphertextBytes: plaintext.length + 16 });
      const ciphertext = await encryptFrame({ aad: frameAad(preamble, headerBytes), key,
        nonce: frameNonce(noncePrefix, sequence++), plaintext });
      yield { headerBytes, ciphertext };
    }
  })();
  return { preamble, frames, contextId };
}

export async function* readRequestSyncWire(input: {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  preamble: Uint8Array;
  frames: AsyncIterable<RequestSyncWireFrame>;
  signal?: AbortSignal;
}): AsyncGenerator<RequestSyncDecodedMessage> {
  input.signal?.throwIfAborted();
  const preamble = decodeFramedSyncPreamble(input.preamble);
  const session = await assertAuthenticatedSessionBootstrap(input.context, preamble);
  const key = await importFrameKey(await deriveSessionFrameKey({ groupKey: input.groupKey,
    sessionContextId: preamble.contextId, sessionId: session.sessionId }), 'decrypt');
  let expectedSequence = 0n;
  for await (const frame of input.frames) {
    input.signal?.throwIfAborted();
    const received = await receiveFramedSyncRequestFrame({ ...frame, frameHeader: frame.headerBytes,
      expectedSequence, key, preamble: input.preamble });
    expectedSequence = received.nextSequence;
    yield { encoded: received.plaintext,
      message: decodeAndValidateProtocolMessage(received.plaintext, received.frameType) };
  }
}
