import { randomBytes, webcrypto } from 'node:crypto';

const PAIRING_SECRET_ENCRYPTION_ALGORITHM = 'ECDH-P256-HKDF-SHA256-AES-GCM';
const PAIRING_SECRET_INFO = new TextEncoder().encode('Foliole companion pairing v1');
type NodeCryptoKey = Parameters<typeof webcrypto.subtle.exportKey>[1];

export interface EncryptedCompanionPairingSecret {
  algorithm: typeof PAIRING_SECRET_ENCRYPTION_ALGORITHM;
  ciphertext: string;
  iv: string;
  salt: string;
  server_public_key: string;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function derivePairingSecretKey(args: {
  privateKey: NodeCryptoKey;
  publicKey: NodeCryptoKey;
  salt: Uint8Array;
}) {
  const sharedSecret = await webcrypto.subtle.deriveBits(
    { name: 'ECDH', public: args.publicKey },
    args.privateKey,
    256
  );
  const hkdfKey = await webcrypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return await webcrypto.subtle.deriveKey(
    {
      hash: 'SHA-256',
      info: PAIRING_SECRET_INFO,
      name: 'HKDF',
      salt: toArrayBuffer(args.salt)
    },
    hkdfKey,
    { length: 256, name: 'AES-GCM' },
    false,
    ['encrypt']
  );
}

export async function encryptCompanionPairingSecret(args: {
  clientPublicKey: string;
  deviceSecret: string;
}): Promise<EncryptedCompanionPairingSecret> {
  const clientPublicKey = await webcrypto.subtle.importKey(
    'raw',
    fromBase64Url(args.clientPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const serverKeyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const secretKey = await derivePairingSecretKey({
    privateKey: serverKeyPair.privateKey,
    publicKey: clientPublicKey as NodeCryptoKey,
    salt
  });
  const ciphertext = await webcrypto.subtle.encrypt(
    { iv, name: 'AES-GCM' },
    secretKey,
    new TextEncoder().encode(args.deviceSecret)
  );
  return {
    algorithm: PAIRING_SECRET_ENCRYPTION_ALGORITHM,
    ciphertext: toBase64Url(ciphertext),
    iv: toBase64Url(iv),
    salt: toBase64Url(salt),
    server_public_key: toBase64Url(await webcrypto.subtle.exportKey('raw', serverKeyPair.publicKey))
  };
}

export function isSupportedPairingPublicKey(value: string) {
  try {
    const bytes = fromBase64Url(value);
    return bytes.length === 65 && bytes[0] === 4;
  } catch {
    return false;
  }
}
