import type { SyncGroupJoinEncryptedInfoPayload } from '../../../lib/platform/nativeCompanionSyncContract.js';

const JOIN_SECRET_INFO = new TextEncoder().encode('Foliole companion pairing v1');
const privateKeys = new Map<string, CryptoKey>();

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const values = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveJoinSecretKey(args: { privateKey: CryptoKey; publicKey: CryptoKey; salt: Uint8Array }) {
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: args.publicKey }, args.privateKey, 256
  );
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { hash: 'SHA-256', info: JOIN_SECRET_INFO, name: 'HKDF', salt: toArrayBuffer(args.salt) },
    hkdfKey, { length: 256, name: 'AES-GCM' }, false, ['decrypt']
  );
}

export async function createCompanionSyncGroupJoinPublicKey(requestId: string) {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  privateKeys.set(requestId, keyPair.privateKey);
  return toBase64Url(await crypto.subtle.exportKey('raw', keyPair.publicKey));
}

export function dropCompanionSyncGroupJoinPrivateKey(requestId: string) {
  privateKeys.delete(requestId);
}

export async function decryptCompanionSyncGroupJoinInfo(
  requestId: string,
  payload: SyncGroupJoinEncryptedInfoPayload
) {
  const privateKey = privateKeys.get(requestId);
  if (!privateKey) throw new Error('Sync Group join key is no longer available.');
  const publicKey = await crypto.subtle.importKey(
    'raw', fromBase64Url(payload.server_public_key), { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const key = await deriveJoinSecretKey({ privateKey, publicKey, salt: fromBase64Url(payload.salt) });
  const plaintext = await crypto.subtle.decrypt(
    { iv: fromBase64Url(payload.iv), name: 'AES-GCM' }, key, fromBase64Url(payload.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}
