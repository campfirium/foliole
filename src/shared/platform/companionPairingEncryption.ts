import type { CompanionPairingSecretPayload } from '../../../lib/platform/nativeCompanionSyncContract';

const PAIRING_SECRET_INFO = new TextEncoder().encode('Foliole companion pairing v1');
const pairingPrivateKeys = new Map<string, CryptoKey>();

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const values = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const value of values) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function derivePairingSecretKey(args: {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  salt: Uint8Array;
}) {
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: args.publicKey },
    args.privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return await crypto.subtle.deriveKey(
    {
      hash: 'SHA-256',
      info: PAIRING_SECRET_INFO,
      name: 'HKDF',
      salt: toArrayBuffer(args.salt)
    },
    hkdfKey,
    { length: 256, name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

export async function createCompanionPairingPublicKey(pairRequestClientId: string) {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  pairingPrivateKeys.set(pairRequestClientId, keyPair.privateKey);
  return toBase64Url(await crypto.subtle.exportKey('raw', keyPair.publicKey));
}

export function dropCompanionPairingPrivateKey(pairRequestClientId: string) {
  pairingPrivateKeys.delete(pairRequestClientId);
}

export async function decryptCompanionPairingSecret(
  pairRequestClientId: string,
  payload: CompanionPairingSecretPayload
) {
  const privateKey = pairingPrivateKeys.get(pairRequestClientId);
  if (!privateKey) {
    throw new Error('Companion pairing key is no longer available.');
  }
  const serverPublicKey = await crypto.subtle.importKey(
    'raw',
    fromBase64Url(payload.server_public_key),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const secretKey = await derivePairingSecretKey({
    privateKey,
    publicKey: serverPublicKey,
    salt: fromBase64Url(payload.salt)
  });
  const plaintext = await crypto.subtle.decrypt(
    { iv: fromBase64Url(payload.iv), name: 'AES-GCM' },
    secretKey,
    fromBase64Url(payload.ciphertext)
  );
  pairingPrivateKeys.delete(pairRequestClientId);
  return new TextDecoder().decode(plaintext);
}
