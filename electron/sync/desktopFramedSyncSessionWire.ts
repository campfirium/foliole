import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import { deriveSessionFrameKey, encryptFrame } from '../../lib/core/sync/framedSyncCrypto.js';
import { assertSessionEnvelopeBinding } from '../../lib/core/sync/framedSyncEnvelopeContract.js';
import {
  decodeFramedSyncPreamble,
  encodeFrameHeader,
  encodeFramedSyncPreamble,
  frameAad,
  frameNonce
} from '../../lib/core/sync/framedSyncFraming.js';
import {
  decodeAndValidateProtocolMessage,
  encodeValidatedProtocolMessage,
  type ValidatedProtocolMessage
} from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { receiveFramedSyncFrame, type ProtocolPayloadCase } from '../../lib/core/sync/framedSyncReceiver.js';
import {
  assertAuthenticatedSessionBootstrap,
  deriveSessionContextId,
  type FramedSyncSessionContext,
  type FramedSyncSessionNoncePort
} from '../../lib/core/sync/framedSyncSession.js';

import {
  framedSyncEncodedLength,
  framedSyncEncodedSha256,
  type FramedSyncEncodedFrame,
  type FramedSyncWireFrame,
  type FramedSyncWritableBody
} from './desktopFramedSyncStream.js';

type AuthenticatedContext = Omit<FramedSyncSessionContext, 'sessionId'>;

export type FramedSyncSessionMessage = Readonly<{
  payload: unknown;
  payloadCase: ProtocolPayloadCase;
}>;

function randomBytes(length: number) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export async function encodeDesktopFramedSyncSession(args: {
  authenticatedContext: AuthenticatedContext;
  groupKey: Uint8Array;
  messages: readonly FramedSyncSessionMessage[];
  noncePort: FramedSyncSessionNoncePort;
}): Promise<FramedSyncWritableBody> {
  const sessionId = randomBytes(16);
  const noncePrefix = randomBytes(4);
  const contextId = await deriveSessionContextId({ ...args.authenticatedContext, sessionId });
  const preamble = encodeFramedSyncPreamble({
    compression: 'none', contextId, contextKind: 'session', noncePrefix,
    sessionId, startingSequence: 0n
  });
  await args.noncePort.persistBeforeEncryption({
    contextId, noncePrefix, sessionId, startingSequence: 0n
  });
  const key = await deriveSessionFrameKey({
    groupKey: args.groupKey, sessionContextId: contextId, sessionId
  });
  const frames: FramedSyncEncodedFrame[] = [];
  let sessionBytes = preamble.byteLength;
  if (args.messages.length > FRAMED_SYNC_LIMITS.maxSessionFrames) throw new Error('session_frame_limit_exceeded');
  for (let index = 0; index < args.messages.length; index += 1) {
    const message = args.messages[index]!;
    const plaintext = encodeValidatedProtocolMessage(message.payloadCase, message.payload);
    sessionBytes += plaintext.byteLength + 32;
    if (sessionBytes > FRAMED_SYNC_LIMITS.maxSessionBytes) throw new Error('session_byte_limit_exceeded');
    const sequence = BigInt(index);
    const headerBytes = encodeFrameHeader({
      ciphertextBytes: plaintext.byteLength + 16,
      flags: 0,
      frameType: FRAMED_SYNC_FRAME_TYPES.sessionControl,
      sequence
    });
    const ciphertext = await encryptFrame({
      aad: frameAad(preamble, headerBytes), key,
      nonce: frameNonce(noncePrefix, sequence), plaintext
    });
    frames.push({ ciphertext, headerBytes });
  }
  return {
    bodySha256: framedSyncEncodedSha256(preamble, frames),
    contentLength: framedSyncEncodedLength(preamble, frames),
    frames: asyncFrames(frames),
    preamble
  };
}

async function* asyncFrames(frames: readonly FramedSyncEncodedFrame[]) {
  yield* frames;
}

export async function decodeDesktopFramedSyncSession(args: {
  authenticatedContext: AuthenticatedContext;
  authorDeviceId: string;
  frames: AsyncIterable<FramedSyncWireFrame>;
  groupKey: Uint8Array;
  preamble: Uint8Array;
}): Promise<readonly ValidatedProtocolMessage[]> {
  const decodedPreamble = decodeFramedSyncPreamble(args.preamble);
  const context = await assertAuthenticatedSessionBootstrap(
    args.authenticatedContext, decodedPreamble
  );
  const key = await deriveSessionFrameKey({
    groupKey: args.groupKey,
    sessionContextId: decodedPreamble.contextId,
    sessionId: context.sessionId
  });
  const messages: ValidatedProtocolMessage[] = [];
  let expectedSequence = 0n;
  let sessionBytes = args.preamble.byteLength;
  for await (const frame of args.frames) {
    sessionBytes += frame.headerBytes.byteLength + frame.ciphertext.byteLength;
    if (messages.length >= FRAMED_SYNC_LIMITS.maxSessionFrames) throw new Error('session_frame_limit_exceeded');
    if (sessionBytes > FRAMED_SYNC_LIMITS.maxSessionBytes) throw new Error('session_byte_limit_exceeded');
    const received = await receiveFramedSyncFrame({
      ciphertext: frame.ciphertext, expectedSequence, frameHeader: frame.headerBytes,
      key, preamble: args.preamble
    });
    const message = decodeAndValidateProtocolMessage(received.plaintext, received.frameType);
    await assertSessionEnvelopeBinding(
      args.authenticatedContext, decodedPreamble, message, args.authorDeviceId
    );
    messages.push(message);
    expectedSequence = received.nextSequence;
  }
  return messages;
}
