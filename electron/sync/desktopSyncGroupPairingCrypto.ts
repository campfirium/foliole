import { webcrypto } from 'node:crypto';

import type { CompanionPairingSecretPayload } from '../../lib/platform/nativeCompanionSyncContract.js';

type NodeCryptoKey = Parameters<typeof webcrypto.subtle.exportKey>[1];
const INFO = new TextEncoder().encode('Foliole companion pairing v1');

export async function createDesktopSyncGroupPairingKey() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    privateKey: pair.privateKey,
    publicKey: Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
  };
}

export async function decryptDesktopSyncGroupPairingSecret(
  privateKey: NodeCryptoKey,
  encrypted: CompanionPairingSecretPayload
) {
  const serverPublicKey = await webcrypto.subtle.importKey(
    'raw', Buffer.from(encrypted.server_public_key, 'base64url'),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const bits = await webcrypto.subtle.deriveBits({ name: 'ECDH', public: serverPublicKey }, privateKey, 256);
  const hkdf = await webcrypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({
    hash: 'SHA-256', info: INFO, name: 'HKDF', salt: Buffer.from(encrypted.salt, 'base64url')
  }, hkdf, { length: 256, name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await webcrypto.subtle.decrypt({
    iv: Buffer.from(encrypted.iv, 'base64url'), name: 'AES-GCM'
  }, key, Buffer.from(encrypted.ciphertext, 'base64url'));
  return new TextDecoder().decode(plaintext);
}
