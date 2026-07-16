import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  backend: 'keychain',
  encryptionAvailable: true,
  userData: ''
}));

vi.mock('electron', () => ({
  app: { getPath: () => electronMock.userData },
  safeStorage: {
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    getSelectedStorageBackend: () => electronMock.backend,
    isEncryptionAvailable: () => electronMock.encryptionAvailable
  }
}));

import {
  deletePublishDeviceSecret,
  hasPublishDeviceSecret,
  readPublishDeviceSecret,
  writePublishDeviceSecret
} from './publishDeviceSecretStore.js';

beforeEach(() => {
  electronMock.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-publish-secret-'));
  electronMock.backend = 'keychain';
  electronMock.encryptionAvailable = true;
});

afterEach(() => {
  fs.rmSync(electronMock.userData, { force: true, recursive: true });
});

it('writes, replaces, reads, and deletes an encrypted device secret', () => {
  writePublishDeviceSecret('secret.bin', 'test secret', 'first');
  writePublishDeviceSecret('secret.bin', 'test secret', 'replacement');

  expect(hasPublishDeviceSecret('secret.bin')).toBe(true);
  expect(readPublishDeviceSecret('secret.bin', 'test secret')).toBe('replacement');
  expect(deletePublishDeviceSecret('secret.bin')).toBe(true);
  expect(readPublishDeviceSecret('secret.bin', 'test secret')).toBe('');
});

it('rejects storage when encryption is unavailable', () => {
  electronMock.encryptionAvailable = false;
  expect(() => writePublishDeviceSecret('secret.bin', 'test secret', 'value')).toThrow('safeStorage is unavailable');
});

it.runIf(process.platform === 'linux')('rejects the Linux basic_text backend', () => {
  electronMock.backend = 'basic_text';
  expect(() => writePublishDeviceSecret('secret.bin', 'test secret', 'value')).toThrow('Secure system storage is unavailable');
});
