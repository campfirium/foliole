// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PEER_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncGroupPeerStore.java'
);
const APP_DATA_STORE = path.join(
  REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android',
  'FolioleCompanionAppDataStore.java'
);

describe('FolioleCompanionSyncGroupPeerStore', () => {
  it('lets Android Keystore generate the AES-GCM encryption IV', async () => {
    const source = await readFile(PEER_STORE, 'utf8');
    const saveBody = source.slice(source.indexOf('private static void save'), source.indexOf('private static SharedPreferences prefs'));

    expect(saveBody).toContain('cipher.init(Cipher.ENCRYPT_MODE, key());');
    expect(saveBody).toContain('byte[] iv = cipher.getIV();');
    expect(saveBody).not.toContain('new GCMParameterSpec(128, iv)');
    expect(saveBody).not.toContain('new java.security.SecureRandom()');
  });

  it('clears Sync Group transport credentials with the rest of companion app data', async () => {
    const source = await readFile(APP_DATA_STORE, 'utf8');
    expect(source).toContain('FolioleCompanionSyncGroupPeerStore.clear(context);');
    expect(source).toContain('FolioleCompanionSyncGroupOutboundPeerStore.clear(context);');
  });
});
