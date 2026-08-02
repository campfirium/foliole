// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { persistMigratedPairingStore } from './pairingStoreMigrationPersistence.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pairing-migration-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('preserves the legacy ciphertext before atomically replacing the active store', async () => {
  const storePath = path.join(tempRoot, 'companion-paired-devices.bin');
  await fs.writeFile(storePath, 'legacy');
  const backupPath = persistMigratedPairingStore({
    encrypted: Buffer.from('current'), original: Buffer.from('legacy'), storePath
  });
  await expect(fs.readFile(storePath, 'utf8')).resolves.toBe('current');
  await expect(fs.readFile(backupPath, 'utf8')).resolves.toBe('legacy');
});

it('refuses to overwrite a different existing legacy backup', async () => {
  const storePath = path.join(tempRoot, 'companion-paired-devices.bin');
  await fs.writeFile(storePath, 'legacy');
  await fs.writeFile(`${storePath}.legacy-mas-safe-storage`, 'different');
  expect(() => persistMigratedPairingStore({
    encrypted: Buffer.from('current'), original: Buffer.from('legacy'), storePath
  })).toThrow('different content');
  await expect(fs.readFile(storePath, 'utf8')).resolves.toBe('legacy');
});
