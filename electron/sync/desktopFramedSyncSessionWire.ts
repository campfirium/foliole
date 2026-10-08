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
import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { leaseFramedSyncPayloads } from '../../lib/core/sync/framedSyncPayloadLease.js';
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

import { spoolDesktopFramedSyncBody } from './desktopFramedSyncBodySpool.js';
import type { FramedSyncEncodedFrame, FramedSyncWireFrame, FramedSyncWritableBody } from './desktopFramedSyncStream.js';

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
  messages: Iterable<FramedSyncSessionMessage> | AsyncIterable<FramedSyncSessionMessage>;
  payloadBudget?: FramedSyncPayloadBudget | undefined;
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
  return spoolDesktopFramedSyncBody({ preamble, payloadBudget: args.payloadBudget,
    frames: leaseFramedSyncPayloads(encodeSessionFrames(args.messages, key, preamble, noncePrefix),
      args.payloadBudget, 'outbound') });
}

async function* encodeSessionFrames(messages: Iterable<FramedSyncSessionMessage> | AsyncIterable<FramedSyncSessionMessage>,
  key: Uint8Array, preamble: Uint8Array, noncePrefix: Uint8Array): AsyncGenerator<FramedSyncEncodedFrame> {
  let sessionBytes = preamble.byteLength;
  let index = 0;
  for await (const message of messages) {
    if (index >= FRAMED_SYNC_LIMITS.maxSessionFrames) throw new Error('session_frame_limit_exceeded');
    const plaintext = encodeValidatedProtocolMessage(message.payloadCase, message.payload);
    sessionBytes += plaintext.byteLength + 32;
    if (sessionBytes > FRAMED_SYNC_LIMITS.maxSessionBytes) throw new Error('session_byte_limit_exceeded');
    const sequence = BigInt(index++);
    const headerBytes = encodeFrameHeader({
      ciphertextBytes: plaintext.byteLength + 16, flags: 0,
      frameType: FRAMED_SYNC_FRAME_TYPES.sessionControl, sequence
    });
    const ciphertext = await encryptFrame({
      aad: frameAad(preamble, headerBytes), key,
      nonce: frameNonce(noncePrefix, sequence), plaintext
    });
    yield { ciphertext, headerBytes };
  }
}

export async function* readDesktopFramedSyncSession(args: {
  authenticatedContext: AuthenticatedContext;
  authorDeviceId: string;
  frames: AsyncIterable<FramedSyncWireFrame>;
  groupKey: Uint8Array;
  preamble: Uint8Array;
  onPlaintextBytes?: (bytes: number) => void;
}): AsyncGenerator<ValidatedProtocolMessage> {
  const decodedPreamble = decodeFramedSyncPreamble(args.preamble);
  const context = await assertAuthenticatedSessionBootstrap(
    args.authenticatedContext, decodedPreamble
  );
  const key = await deriveSessionFrameKey({
    groupKey: args.groupKey,
    sessionContextId: decodedPreamble.contextId,
    sessionId: context.sessionId
  });
  let frameCount = 0;
  let expectedSequence = 0n;
  let sessionBytes = args.preamble.byteLength;
  for await (const frame of args.frames) {
    sessionBytes += frame.headerBytes.byteLength + frame.ciphertext.byteLength;
    if (frameCount++ >= FRAMED_SYNC_LIMITS.maxSessionFrames) throw new Error('session_frame_limit_exceeded');
    if (sessionBytes > FRAMED_SYNC_LIMITS.maxSessionBytes) throw new Error('session_byte_limit_exceeded');
    const received = await receiveFramedSyncFrame({
      ciphertext: frame.ciphertext, expectedSequence, frameHeader: frame.headerBytes,
      key, preamble: args.preamble
    });
    const message = decodeAndValidateProtocolMessage(received.plaintext, received.frameType);
    await assertSessionEnvelopeBinding(
      args.authenticatedContext, decodedPreamble, message, args.authorDeviceId
    );
    args.onPlaintextBytes?.(received.plaintext.byteLength);
    yield message;
    expectedSequence = received.nextSequence;
  }
}

export async function decodeDesktopFramedSyncSession(args: Parameters<typeof readDesktopFramedSyncSession>[0]) {
  const messages: ValidatedProtocolMessage[] = [];
  for await (const message of readDesktopFramedSyncSession(args)) messages.push(message);
  return messages;
}
