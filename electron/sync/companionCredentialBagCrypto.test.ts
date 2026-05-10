import { createDecipheriv, hkdfSync } from 'node:crypto';

import { expect, it } from 'vitest';

import { encryptCredentialBag } from './companionCredentialBagCrypto.js';

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}

function decryptForTest(args: { ciphertext: string; deviceSecret: string; iv: string; salt: string; service: 'readwise_token' }) {
  const key = Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(args.deviceSecret, 'utf8'),
    fromBase64Url(args.salt),
    Buffer.from(`Foliole credential bag v1/${args.service}`, 'utf8'),
    32
  ));
  const encrypted = fromBase64Url(args.ciphertext);
  const decipher = createDecipheriv('aes-256-gcm', key, fromBase64Url(args.iv));
  decipher.setAuthTag(encrypted.subarray(encrypted.byteLength - 16));
  return Buffer.concat([
    decipher.update(encrypted.subarray(0, encrypted.byteLength - 16)),
    decipher.final()
  ]).toString('utf8');
}

it('encrypts a Readwise token credential bag with a domain-separated pairing key', () => {
  const bag = encryptCredentialBag({
    deviceSecret: 'paired-device-secret',
    plaintext: 'readwise-token-secret',
    service: 'readwise_token'
  });

  expect(JSON.stringify(bag)).not.toContain('readwise-token-secret');
  expect(decryptForTest({
    ciphertext: bag.ciphertext,
    deviceSecret: 'paired-device-secret',
    iv: bag.iv,
    salt: bag.salt,
    service: bag.service
  })).toBe('readwise-token-secret');
});
