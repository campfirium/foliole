// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const migrationMock = vi.hoisted(() => ({ migrate: vi.fn() }));

vi.mock('electron', () => ({
  app: { getPath: () => testRoot },
  safeStorage: {
    decryptString: () => { throw new Error('current key cannot decrypt legacy ciphertext'); },
    encryptString: (value: string) => Buffer.from(value),
    getSelectedStorageBackend: () => 'gnome_libsecret',
    isEncryptionAvailable: () => true
  }
}));

vi.mock('./macosLegacyPairingStoreMigration.js', () => {
  class LegacyPairingStoreMigrationError extends Error {}
  return {
    LegacyPairingStoreMigrationError,
    migrateLegacyMacosPairingCiphertext: migrationMock.migrate
  };
});

let testRoot = '';

it('preserves legacy ciphertext when the intentional Keychain migration cannot complete', async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pairing-preserve-'));
  const storePath = path.join(testRoot, 'companion-paired-devices.bin');
  await fs.writeFile(storePath, 'legacy-ciphertext');
  const { LegacyPairingStoreMigrationError } = await import('./macosLegacyPairingStoreMigration.js');
  migrationMock.migrate.mockImplementation(() => {
    throw new LegacyPairingStoreMigrationError('legacy_key_unavailable');
  });
  const { countPairedCompanionDevices } = await import('./companionPairingStore.js');

  expect(() => countPairedCompanionDevices()).toThrow('paired-device store is unreadable');
  await expect(fs.readFile(storePath, 'utf8')).resolves.toBe('legacy-ciphertext');
  expect((await fs.readdir(testRoot)).some((name) => name.includes('.corrupt-'))).toBe(false);
  await fs.rm(testRoot, { force: true, recursive: true });
});
