import { createDecipheriv, createHash, createPublicKey, diffieHellman, hkdfSync } from 'node:crypto';

import { expect, it } from 'vitest';

import {
  webDavCredentialOfferSchema, webDavCredentialTranscript
} from '../../lib/platform/webDavCredentialDeliveryContract.js';

import {
  createWebDavCredentialKey, matchesWebDavCredentialProof, sealWebDavCredentials, webDavCredentialKeys, webDavCredentialProof
} from './desktopWebDavCredentialCrypto.js';

it('seals credentials to the compared transcript and matching phone key', () => {
  const desktop = createWebDavCredentialKey();
  const phone = createWebDavCredentialKey();
  const stranger = createWebDavCredentialKey();
  const offer = webDavCredentialOfferSchema.parse({
    id: '30ba2a38-6860-4e26-ac67-4407be8bd351', version: 1, library_epoch: 'epoch-phone', desktop_key: desktop.publicKey,
    binding: { id: '7f2947b9-2938-470f-80a1-99eaf199cbac', group_id: 'group', desktop_device_id: 'mac',
      phone_device_id: 'phone', directory_url: 'https://dav.example.test/relay/' }
  });
  const keys = webDavCredentialKeys(offer, phone.publicKey, desktop.privateKey);
  const transcript = webDavCredentialTranscript(offer, phone.publicKey);
  const digest = createHash('sha256').update(transcript).digest();
  expect(keys.fingerprint).toBe(digest.subarray(0, 16).toString('hex'));
  expect(webDavCredentialKeys(offer, stranger.publicKey, desktop.privateKey).fingerprint).not.toBe(keys.fingerprint);
  expect(webDavCredentialKeys({ ...offer, version: 2 }, phone.publicKey, desktop.privateKey).fingerprint).not.toBe(keys.fingerprint);

  const peer = createPublicKey({ key: Buffer.from(offer.desktop_key, 'base64url'), format: 'der', type: 'spki' });
  const secret = diffieHellman({ privateKey: phone.privateKey, publicKey: peer });
  const derive = (purpose: string) => Buffer.from(hkdfSync('sha256', secret, digest, `WebDAV credential ${purpose}`, 32));
  expect(matchesWebDavCredentialProof(webDavCredentialProof(keys.confirmation, 'confirmed'),
    webDavCredentialProof(derive('confirmation'), 'confirmed'))).toBe(true);
  expect(matchesWebDavCredentialProof(webDavCredentialProof(keys.receipt, 'installed'),
    webDavCredentialProof(derive('confirmation'), 'installed'))).toBe(false);

  const envelope = sealWebDavCredentials(keys, { username: 'phone-user', password: 'test-secret' });
  const encrypted = Buffer.from(envelope.ciphertext, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', derive('encryption'), Buffer.from(envelope.iv, 'base64url'));
  decipher.setAAD(Buffer.from(transcript));
  decipher.setAuthTag(encrypted.subarray(-16));
  expect(JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString()))
    .toEqual({ username: 'phone-user', password: 'test-secret' });
});
