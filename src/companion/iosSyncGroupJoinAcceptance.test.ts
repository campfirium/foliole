// @vitest-environment node
import { webcrypto } from 'node:crypto';

import { expect, it } from 'vitest';

import type { CompanionPairingSecretPayload } from '../../lib/platform/nativeCompanionSyncContract';

import { decryptGroupInfo } from './iosSyncGroupJoinAcceptance';

const subtle = webcrypto.subtle as SubtleCrypto;
const info = new TextEncoder().encode('Foliole companion pairing v1');

function encode(value: ArrayBuffer | Uint8Array) {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString('base64url');
}

async function seal(plaintext: object, requesterPublicKey: CryptoKey, serverPrivateKey: CryptoKey) {
  const salt = webcrypto.getRandomValues(new Uint8Array(32));
  const shared = await subtle.deriveBits({ name: 'ECDH', public: requesterPublicKey }, serverPrivateKey, 256);
  const material = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', info, salt }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(plaintext))
  );
  return { ciphertext: encode(ciphertext), iv: encode(iv), salt: encode(salt) };
}

it('decrypts the P-256 ECDH, HKDF-SHA256, and AES-GCM provider envelope', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const requester = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const server = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const groupInfo = { display_name: 'Acceptance Sync Group', group_id: 'group-t152-ios-runtime',
    workgroup_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
  const encrypted = await seal(groupInfo, requester.publicKey, server.privateKey);
  const envelope: CompanionPairingSecretPayload = {
    algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM', ...encrypted,
    server_public_key: encode(await subtle.exportKey('raw', server.publicKey))
  };
  await expect(decryptGroupInfo(envelope, requester.privateKey)).resolves.toEqual(groupInfo);
});
