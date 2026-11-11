import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';

import { safeStorage } from 'electron';

import { readDesktopWebDavCredentialCiphertext, replaceDesktopWebDavCredentialCiphertext } from './desktopWebDavCredentialStore.js';

function decodeIdentity(scope: string, result: string) {
  const [savedScope, encoded] = JSON.parse(result) as [unknown, unknown];
  if (savedScope !== scope || typeof encoded !== 'string') throw new Error('webdav_relay_secure_storage_unavailable');
  const privateKey = createPrivateKey({ key: Buffer.from(encoded, 'base64url'), format: 'der', type: 'pkcs8' });
  if (privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('webdav_relay_secure_storage_unavailable');
  return privateKey;
}

async function loadIdentity(scope: string) {
  const stored = readDesktopWebDavCredentialCiphertext(scope);
  if (stored) return decodeIdentity(scope, (await safeStorage.decryptStringAsync(stored)).result);
  return null;
}

export async function loadOrCreateDesktopWebDavIdentity(credentialScope: string) {
  const scope = JSON.stringify(['webdav-device-identity-v1', credentialScope]);
  try {
    let privateKey = await loadIdentity(scope);
    if (!privateKey) {
      if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('webdav_relay_secure_storage_unavailable');
      privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
      const encoded = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url');
      const encrypted = await safeStorage.encryptStringAsync(JSON.stringify([scope, encoded]));
      const concurrent = readDesktopWebDavCredentialCiphertext(scope);
      if (concurrent) privateKey = decodeIdentity(scope, (await safeStorage.decryptStringAsync(concurrent)).result);
      else replaceDesktopWebDavCredentialCiphertext(scope, encrypted);
    }
    return { privateKey, publicKey: exportPublicKey(privateKey) };
  } catch {
    throw new Error('webdav_relay_secure_storage_unavailable');
  }
}

function exportPublicKey(privateKey: KeyObject) {
  return createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64url');
}
