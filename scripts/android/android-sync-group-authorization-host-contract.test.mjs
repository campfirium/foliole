// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('Android Sync Group authorization host contract', () => {
  it('separates member and verification records behind AndroidKeyStore AES-GCM', () => {
    const adapter = read(
      'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupAuthorizationAndroidStore.java'
    );
    const asset = JSON.parse(read(
      'android/app/src/main/assets/companion-sync-group-bridge-contract-definitions.json'
    ));

    expect(adapter).toContain('KeyStore.getInstance("AndroidKeyStore")');
    expect(adapter).toContain('Cipher.getInstance("AES/GCM/NoPadding")');
    expect(adapter).toContain('.setRandomizedEncryptionRequired(true)');
    expect(adapter).toContain('create(context, "member", "memberPreferencesName", "memberKeyAlias")');
    expect(adapter).toContain('create(context, "verification", "verificationPreferencesName", "verificationKeyAlias")');
    expect(asset.authorization.storage.memberPreferencesName)
      .not.toBe(asset.authorization.storage.verificationPreferencesName);
    expect(asset.authorization.storage.memberKeyAlias)
      .not.toBe(asset.authorization.storage.verificationKeyAlias);
  });

  it('keeps migration prepare-only and leaves legacy pairing untouched', () => {
    const actions = read(
      'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupAuthorizationPluginActions.java'
    );

    expect(actions).toContain('contract.prepareToken()');
    expect(actions).toContain('migrationCredentialSecret(context)');
    expect(actions).toContain('.member(context).save(record)');
    expect(actions).not.toContain('clearPairingCredentials');
    expect(actions).not.toContain('clearSyncGroupCredentials');
  });

  it('locks restart signing, replay rejection, and revoke in the Java route contract', () => {
    const test = read(
      'android/app/src/test/java/com/foliole/android/FolioleCompanionSyncGroupAuthorizationStoreTest.java'
    );

    expect(test).toContain('restartedMember.sign');
    expect(test).toContain('restartedVerification.verify');
    expect(test).toContain('assertThrows(SecurityException.class');
    expect(test).toContain('restartedMember.revoke');
  });
});
