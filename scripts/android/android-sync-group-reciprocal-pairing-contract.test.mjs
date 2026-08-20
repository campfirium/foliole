// @vitest-environment node
/* global process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

const ROOT = process.cwd();

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
}

it('persists reciprocal credentials for authenticated requests in both Android roles', async () => {
  const [pairing, encryption, actions, server, outbound, contract] = await Promise.all([
    source('src/shared/platform/companionWorkspacePairing.ts'),
    source('src/shared/platform/companionPairingEncryption.ts'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionPairingPluginActions.java'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupServer.java'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupOutboundPairing.java'),
    source('android/app/src/main/assets/companion-bridge-contract-definitions.json')
  ]);

  expect(pairing).toContain('payload.provider_encrypted_credential_secret');
  expect(pairing).toContain('providerSecret !== credentialSecret');
  expect(pairing).toContain('workgroupKey: credentialSecret');
  expect(encryption.slice(encryption.indexOf('export async function decryptCompanionPairingSecret')))
    .not.toContain('pairingPrivateKeys.delete(pairRequestClientId)');
  expect(actions).toContain('FolioleCompanionSyncGroupOutboundPeerStore.save(');
  expect(server).toContain('FolioleCompanionSyncGroupOutboundPairing.save(');
  expect(server).toContain('FolioleCompanionWorkgroupSession.requireKey()');
  expect(server).toContain('provider_encrypted_credential_secret", FolioleCompanionSyncGroupPairCrypto.encrypt(pending.pairingPublicKey, workgroupKey)');
  expect(outbound).not.toContain('FolioleCompanionPairingStore.savePairingCredentials(');
  expect(outbound).toContain('FolioleCompanionSyncGroupOutboundPeerStore.save(');
  expect(outbound).toContain('FolioleCompanionSyncGroupDatabase.saveSyncEndpoint(dataBridge, endpointUrl, now)');
  expect(JSON.parse(contract).pairingPlugin.credentialRequestKeys.providerDeviceSecret)
    .toBe('provider_device_secret');
});
