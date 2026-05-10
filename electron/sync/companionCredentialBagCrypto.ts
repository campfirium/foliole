import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';

import type { NativeCredentialBagPayload } from '../../lib/platform/nativeCompanionSyncContract.js';

const CREDENTIAL_BAG_INFO_PREFIX = 'Foliole credential bag v1';

function toBase64Url(bytes: Buffer) {
  return bytes.toString('base64url');
}

function deriveCredentialBagKey(args: { deviceSecret: string; salt: Buffer; service: NativeCredentialBagPayload['service'] }) {
  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(args.deviceSecret, 'utf8'),
    args.salt,
    Buffer.from(`${CREDENTIAL_BAG_INFO_PREFIX}/${args.service}`, 'utf8'),
    32
  ));
}

export function encryptCredentialBag(args: {
  deviceSecret: string;
  plaintext: string;
  service: NativeCredentialBagPayload['service'];
}): NativeCredentialBagPayload {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = deriveCredentialBagKey({ deviceSecret: args.deviceSecret, salt, service: args.service });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(args.plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  return {
    algorithm: 'HKDF-SHA256-AES-GCM',
    ciphertext: toBase64Url(ciphertext),
    exported_at: new Date().toISOString(),
    iv: toBase64Url(iv),
    salt: toBase64Url(salt),
    service: args.service
  };
}
