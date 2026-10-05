import {
  assertSessionId,
  FRAMED_SYNC_PROTOCOL_VERSION
} from './framedSyncContract.js';
import type { FramedSyncPreamble } from './framedSyncFraming.js';

export type FramedSyncSessionContext = Readonly<{
  groupId: string;
  initiatorDeviceId: string;
  initiatorLibraryEpoch: string;
  protocolVersion: typeof FRAMED_SYNC_PROTOCOL_VERSION;
  responderDeviceId: string;
  responderLibraryEpoch: string;
  sessionId: Uint8Array;
}>;

const encoder = new TextEncoder();
const domain = encoder.encode('foliole-framed-sync-session-context-v1');

function textBytes(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error('session_context_unicode_invalid');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error('session_context_unicode_invalid');
    }
  }
  const bytes = encoder.encode(value);
  const result = new Uint8Array(4 + bytes.byteLength);
  new DataView(result.buffer).setUint32(0, bytes.byteLength);
  result.set(bytes, 4);
  return result;
}

function concat(values: readonly Uint8Array[]) {
  const result = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
  let offset = 0;
  for (const value of values) { result.set(value, offset); offset += value.byteLength; }
  return result;
}

export async function deriveSessionContextId(context: FramedSyncSessionContext) {
  if (context.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION) {
    throw new Error('session_protocol_version_invalid');
  }
  const version = new Uint8Array(2);
  new DataView(version.buffer).setUint16(0, context.protocolVersion);
  const bytes = concat([
    domain, Uint8Array.of(0), version,
    textBytes(context.groupId),
    textBytes(context.initiatorDeviceId),
    textBytes(context.initiatorLibraryEpoch),
    textBytes(context.responderDeviceId),
    textBytes(context.responderLibraryEpoch),
    assertSessionId(context.sessionId)
  ]);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

export async function assertAuthenticatedSessionBootstrap(
  authenticatedHttpContext: Omit<FramedSyncSessionContext, 'sessionId'>,
  preamble: FramedSyncPreamble
) {
  if (preamble.contextKind !== 'session') throw new Error('session_preamble_required');
  if (preamble.startingSequence !== 0n) throw new Error('session_starting_sequence_invalid');
  const expected = await deriveSessionContextId({
    ...authenticatedHttpContext,
    sessionId: preamble.sessionId
  });
  if (!sameBytes(expected, preamble.contextId)) throw new Error('session_context_mismatch');
  return { ...authenticatedHttpContext, sessionId: preamble.sessionId };
}

export type PersistedSessionSendState = Readonly<{
  contextId: Uint8Array;
  noncePrefix: Uint8Array;
  sessionId: Uint8Array;
  startingSequence: 0n;
}>;

export interface FramedSyncSessionNoncePort {
  persistBeforeEncryption(state: PersistedSessionSendState): Promise<'created' | 'identical'>;
  abandon(sessionId: Uint8Array): Promise<void>;
}

export const FRAMED_SYNC_SESSION_INVARIANTS = Object.freeze([
  'authenticated_http_binds_group_and_both_device_and_library_epoch_identities_before_handshake_decrypt',
  'session_id_and_nonce_prefix_are_random_and_persisted_before_first_encryption',
  'same_session_id_nonce_prefix_and_sequence_may_only_replay_identical_ciphertext',
  'reconnect_never_resumes_session_sequences_and_persists_a_new_session_id_and_nonce_prefix'
] as const);
