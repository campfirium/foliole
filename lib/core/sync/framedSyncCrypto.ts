import {
  assertAttemptId,
  assertFramedSyncDigest,
  assertSessionId,
  FRAMED_SYNC_KDF
} from './framedSyncContract.js';

const encoder = new TextEncoder();

function cryptoBytes(value: Uint8Array) {
  if (value.buffer instanceof ArrayBuffer) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value);
}

function concat(left: Uint8Array, right: Uint8Array) {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left); result.set(right, left.byteLength);
  return result;
}

function kdfInfo(domain: string, contextId: Uint8Array) {
  return concat(concat(encoder.encode(domain), Uint8Array.of(0)), assertFramedSyncDigest(contextId, 'context_id'));
}

export async function deriveTransferFrameKey(args: {
  attemptId: Uint8Array;
  groupKey: Uint8Array;
  transferId: Uint8Array;
}) {
  if (args.groupKey.byteLength !== 32) throw new Error('group_key_must_be_32_bytes');
  const material = await globalThis.crypto.subtle.importKey('raw', cryptoBytes(args.groupKey), 'HKDF', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({
    hash: 'SHA-256', info: kdfInfo(FRAMED_SYNC_KDF.transferInfo, args.transferId),
    name: 'HKDF', salt: cryptoBytes(assertAttemptId(args.attemptId))
  }, material, 256);
  return new Uint8Array(bits);
}

export async function deriveSessionFrameKey(args: {
  groupKey: Uint8Array;
  sessionContextId: Uint8Array;
  sessionId: Uint8Array;
}) {
  if (args.groupKey.byteLength !== 32) throw new Error('group_key_must_be_32_bytes');
  const material = await globalThis.crypto.subtle.importKey(
    'raw', cryptoBytes(args.groupKey), 'HKDF', false, ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits({
    hash: 'SHA-256', info: kdfInfo(FRAMED_SYNC_KDF.sessionInfo, args.sessionContextId),
    name: 'HKDF', salt: cryptoBytes(assertSessionId(args.sessionId))
  }, material, 256);
  return new Uint8Array(bits);
}

export async function encryptFrame(args: {
  aad: Uint8Array;
  key: Uint8Array;
  nonce: Uint8Array;
  plaintext: Uint8Array;
}) {
  if (args.key.byteLength !== 32 || args.nonce.byteLength !== 12) throw new Error('frame_crypto_input_invalid');
  const key = await globalThis.crypto.subtle.importKey('raw', cryptoBytes(args.key), { name: 'AES-GCM' }, false, ['encrypt']);
  return new Uint8Array(await globalThis.crypto.subtle.encrypt({
    additionalData: cryptoBytes(args.aad), iv: cryptoBytes(args.nonce), name: 'AES-GCM', tagLength: 128
  }, key, cryptoBytes(args.plaintext)));
}

export async function decryptFrame(args: {
  aad: Uint8Array;
  ciphertext: Uint8Array;
  key: Uint8Array;
  nonce: Uint8Array;
}) {
  if (args.key.byteLength !== 32 || args.nonce.byteLength !== 12) {
    throw new Error('frame_crypto_input_invalid');
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw', cryptoBytes(args.key), { name: 'AES-GCM' }, false, ['decrypt']
  );
  try {
    return new Uint8Array(await globalThis.crypto.subtle.decrypt({
      additionalData: cryptoBytes(args.aad), iv: cryptoBytes(args.nonce), name: 'AES-GCM', tagLength: 128
    }, key, cryptoBytes(args.ciphertext)));
  } catch {
    throw new Error('frame_authentication_failed');
  }
}
