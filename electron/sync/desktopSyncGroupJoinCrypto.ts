import { webcrypto } from 'node:crypto';

import type { SyncGroupJoinEncryptedInfoPayload } from '../../lib/platform/nativeCompanionSyncContract.js';

type NodeCryptoKey = Parameters<typeof webcrypto.subtle.exportKey>[1];
const INFO = new TextEncoder().encode('Foliole companion pairing v1');

export async function createDesktopSyncGroupJoinKey() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    privateKey: pair.privateKey,
    publicKey: Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
  };
}

export async function encryptDesktopSyncGroupJoinInfo(args: {
  clientPublicKey: string;
  groupInfo: string;
}) {
  const clientPublicKey = await webcrypto.subtle.importKey(
    'raw', Buffer.from(args.clientPublicKey, 'base64url'),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const server = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const key = await deriveKey(server.privateKey, clientPublicKey);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const salt = webcrypto.getRandomValues(new Uint8Array(32));
  const encrypted = await encryptWithSalt(key, salt, iv, args.groupInfo);
  return {
    algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM' as const,
    ciphertext: Buffer.from(encrypted).toString('base64url'),
    iv: Buffer.from(iv).toString('base64url'),
    salt: Buffer.from(salt).toString('base64url'),
    server_public_key: Buffer.from(await webcrypto.subtle.exportKey('raw', server.publicKey)).toString('base64url')
  };
}

export async function decryptDesktopSyncGroupJoinInfo(
  privateKey: NodeCryptoKey,
  encrypted: SyncGroupJoinEncryptedInfoPayload
) {
  const serverPublicKey = await webcrypto.subtle.importKey(
    'raw', Buffer.from(encrypted.server_public_key, 'base64url'),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const baseKey = await deriveKey(privateKey, serverPublicKey);
  const key = await hkdfKey(baseKey, Buffer.from(encrypted.salt, 'base64url'));
  const plaintext = await webcrypto.subtle.decrypt({
    iv: Buffer.from(encrypted.iv, 'base64url'), name: 'AES-GCM'
  }, key, Buffer.from(encrypted.ciphertext, 'base64url'));
  return new TextDecoder().decode(plaintext);
}

async function deriveKey(privateKey: NodeCryptoKey, publicKey: NodeCryptoKey) {
  return webcrypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
}

async function hkdfKey(bits: ArrayBuffer, salt: Uint8Array<ArrayBuffer>) {
  const hkdf = await webcrypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey({ hash: 'SHA-256', info: INFO, name: 'HKDF', salt }, hkdf,
    { length: 256, name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptWithSalt(
  bits: ArrayBuffer,
  salt: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
  plaintext: string
) {
  const key = await hkdfKey(bits, salt);
  return webcrypto.subtle.encrypt({ iv, name: 'AES-GCM' }, key, new TextEncoder().encode(plaintext));
}
