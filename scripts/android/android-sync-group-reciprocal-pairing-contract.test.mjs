// @vitest-environment node
/* global process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

const ROOT = process.cwd();

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
}

it('persists the provider credential for authenticated requests back into Android', async () => {
  const [pairing, encryption, actions, peerStore, contract] = await Promise.all([
    source('src/shared/platform/companionWorkspacePairing.ts'),
    source('src/shared/platform/companionPairingEncryption.ts'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionPairingPluginActions.java'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupPeerStore.java'),
    source('android/app/src/main/assets/companion-bridge-contract-definitions.json')
  ]);

  expect(pairing).toContain('payload.provider_encrypted_device_secret');
  expect(pairing).toContain('provider_device_secret: providerSecret');
  expect(encryption.slice(encryption.indexOf('export async function decryptCompanionPairingSecret')))
    .not.toContain('pairingPrivateKeys.delete(pairRequestClientId)');
  expect(actions).toContain('FolioleCompanionSyncGroupPeerStore.saveSecret(context, primaryDeviceId, providerDeviceSecret);');
  expect(peerStore).toContain('static void saveSecret(Context context, String deviceId, String encodedSecret)');
  expect(JSON.parse(contract).pairingPlugin.credentialRequestKeys.providerDeviceSecret)
    .toBe('provider_device_secret');
});
