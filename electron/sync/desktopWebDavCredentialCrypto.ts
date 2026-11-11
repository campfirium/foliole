import {
  createCipheriv, createHash, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes,
  timingSafeEqual, verify, type KeyObject
} from 'node:crypto';

import {
  webDavCredentialTranscript, type WebDavCredentialEnvelope, type WebDavCredentialOffer
} from '../../lib/platform/webDavCredentialDeliveryContract.js';

export function createWebDavCredentialKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privateKey, publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url') };
}

function readWebDavPublicKey(encoded: string) {
  const key = createPublicKey({ key: Buffer.from(encoded, 'base64url'), format: 'der', type: 'spki' });
  if (key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('webdav_credential_offer_invalid');
  return key;
}

export function verifyWebDavDeviceIdentity(publicKey: string, transcript: Buffer, proof: string) {
  return verify('sha256', transcript, readWebDavPublicKey(publicKey), Buffer.from(proof, 'base64url'));
}

export function webDavCredentialKeys(offer: WebDavCredentialOffer, phoneKey: string, privateKey: KeyObject,
  phoneIdentityKey?: string) {
  const transcript = Buffer.from(webDavCredentialTranscript(offer, phoneKey, phoneIdentityKey));
  const peer = readWebDavPublicKey(phoneKey);
  if (phoneIdentityKey) readWebDavPublicKey(phoneIdentityKey);
  const digest = createHash('sha256').update(transcript).digest();
  const secret = diffieHellman({ privateKey, publicKey: peer });
  try {
    const derive = (purpose: string) => Buffer.from(hkdfSync('sha256', secret, digest, purpose, 32));
    return { transcript, fingerprint: digest.subarray(0, 16).toString('hex'),
      encryption: derive('WebDAV credential encryption'), confirmation: derive('WebDAV credential confirmation'),
      receipt: derive('WebDAV credential receipt') };
  } finally {
    secret.fill(0);
  }
}

export function webDavCredentialProof(key: Buffer, text: string) {
  return createHmac('sha256', key).update(text).digest('base64url');
}

export function matchesWebDavCredentialProof(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sealWebDavCredentials(keys: ReturnType<typeof webDavCredentialKeys>,
  credentials: { username: string; password: string }): WebDavCredentialEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys.encryption, iv);
  cipher.setAAD(keys.transcript);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials)), cipher.final(), cipher.getAuthTag()]);
  return { iv: iv.toString('base64url'), ciphertext: ciphertext.toString('base64url') };
}
