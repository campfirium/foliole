// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let userDataDir = '';
const encryptString = vi.hoisted(() => vi.fn((value: string) => Buffer.from(value, 'utf8')));

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    decryptString: (value: Buffer) => value.toString('utf8'), encryptString,
    getSelectedStorageBackend: () => 'gnome_libsecret', isEncryptionAvailable: () => true
  }
}));

import {
  clearPairedCompanionAuthorizations,
  loadPairedCompanionAuthorization,
  migratePairedCompanionStore
} from './companionPairingStore.js';

let tempRoot = '';

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-pairing-cutover-'));
  userDataDir = path.join(tempRoot, 'user-data');
  fs.mkdirSync(userDataDir, { recursive: true });
  encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf8'));
  clearPairedCompanionAuthorizations();
});

afterEach(() => {
  clearPairedCompanionAuthorizations();
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

it('cuts legacy Device credentials over to the Host authorization without changing the secret', () => {
  writeLegacyStore();
  expect(migratePairedCompanionStore((host) => host === 'A5' ? 'authorization-a5' : null)).toBe(true);
  expect(loadPairedCompanionAuthorization('authorization-a5')).toEqual(expect.objectContaining({
    authorization_id: 'authorization-a5', credential_secret: 'legacy-secret', host_name: 'A5'
  }));
});

it('restores the exact legacy ciphertext when the cutover write fails', () => {
  const storePath = writeLegacyStore();
  const before = fs.readFileSync(storePath);
  encryptString.mockImplementation(() => { throw new Error('cutover encryption failed'); });
  expect(() => migratePairedCompanionStore(() => 'authorization-a5')).toThrow('cutover encryption failed');
  expect(fs.readFileSync(storePath)).toEqual(before);
});

function writeLegacyStore() {
  const storePath = path.join(userDataDir, 'companion-paired-devices.bin');
  fs.writeFileSync(storePath, JSON.stringify({
    devices: [{ device_id: 'legacy-device', device_kind: 'android-capacitor',
      device_name: 'A5', device_secret: 'legacy-secret', paired_at: '2026-08-19T00:00:00.000Z' }],
    client_peers: [], format_version: 1
  }));
  return storePath;
}
