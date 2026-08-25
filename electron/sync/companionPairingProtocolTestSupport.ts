import { webcrypto } from 'node:crypto';

import type { SyncGroupLibraryFacts } from '../../lib/platform/syncGroupContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import type { EncryptedCompanionPairingSecret } from './companionPairingEncryption.js';

const PAIRING_SECRET_INFO = new TextEncoder().encode('Foliole companion pairing v1');
type NodeCryptoKey = Parameters<typeof webcrypto.subtle.exportKey>[1];

function toBase64Url(bytes: ArrayBuffer) {
  return Buffer.from(new Uint8Array(bytes)).toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function createTestPairingKeyPair() {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  return {
    privateKey: keyPair.privateKey,
    publicKey: toBase64Url(await webcrypto.subtle.exportKey('raw', keyPair.publicKey))
  };
}

export function createTestPairRequestPayload(args: {
  group?: {
    groupId: string;
    groupTag: string;
    libraryFacts: SyncGroupLibraryFacts;
    timelineId: string;
  };
  hostName: string;
  hostPlatform: string;
  pairingPublicKey: string;
}) {
  return {
    host_name: args.hostName,
    host_platform: args.hostPlatform,
    ...(args.group ? {
      group_id: args.group.groupId,
      group_tag: args.group.groupTag,
      library_facts: args.group.libraryFacts,
      timeline_id: args.group.timelineId
    } : {}),
    pairing_public_key: args.pairingPublicKey,
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  };
}

export async function decryptTestPairingSecret(args: {
  encrypted: EncryptedCompanionPairingSecret;
  privateKey: NodeCryptoKey;
}) {
  const serverPublicKey = await webcrypto.subtle.importKey(
    'raw',
    fromBase64Url(args.encrypted.server_public_key),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const sharedSecret = await webcrypto.subtle.deriveBits(
    { name: 'ECDH', public: serverPublicKey },
    args.privateKey,
    256
  );
  const hkdfKey = await webcrypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  const secretKey = await webcrypto.subtle.deriveKey(
    {
      hash: 'SHA-256',
      info: PAIRING_SECRET_INFO,
      name: 'HKDF',
      salt: toArrayBuffer(fromBase64Url(args.encrypted.salt))
    },
    hkdfKey,
    { length: 256, name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const plaintext = await webcrypto.subtle.decrypt(
    { iv: fromBase64Url(args.encrypted.iv), name: 'AES-GCM' },
    secretKey,
    fromBase64Url(args.encrypted.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

export async function decryptTestPairingSecrets(args: {
  encryptedCredentialSecret: EncryptedCompanionPairingSecret;
  privateKey: NodeCryptoKey;
  providerEncryptedCredentialSecret?: EncryptedCompanionPairingSecret;
}) {
  const credentialSecret = await decryptTestPairingSecret({
    encrypted: args.encryptedCredentialSecret,
    privateKey: args.privateKey
  });
  const providerSecret = args.providerEncryptedCredentialSecret
    ? await decryptTestPairingSecret({
      encrypted: args.providerEncryptedCredentialSecret,
      privateKey: args.privateKey
    })
    : null;
  return { credentialSecret, providerSecret };
}
