// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAIRING_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionPairingStore.java'
);
const PROTOCOL_STORE = path.join(
  REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android',
  'FolioleCompanionPairingProtocolStore.java'
);

describe('FolioleCompanionPairingStore', () => {
  it('lets Android Keystore generate the AES-GCM encryption IV', async () => {
    const source = await readFile(PAIRING_STORE, 'utf8');
    const savePairingCredentialsBody = source.slice(
      source.indexOf('static JSObject savePairingCredentials'),
      source.indexOf('static JSObject signRequest')
    );

    expect(savePairingCredentialsBody).toContain('cipher.init(Cipher.ENCRYPT_MODE, loadOrCreateSecretKey(context));');
    expect(savePairingCredentialsBody).toContain('byte[] iv = cipher.getIV();');
    expect(savePairingCredentialsBody).not.toContain('new GCMParameterSpec(128, iv)');
    expect(savePairingCredentialsBody).not.toContain('new SecureRandom()');
  });

  it('reads the accepted pairing version from the generated shared sync contract', async () => {
    const source = await readFile(PROTOCOL_STORE, 'utf8');

    expect(source).toContain('FolioleCompanionSyncProtocolDefinitions.currentProtocolVersion(context)');
    expect(source).not.toMatch(/CURRENT_PROTOCOL_VERSION\s*=\s*\d+/);
  });
});
