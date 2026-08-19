// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { registerPairedCompanionDevice } from './companionPairingStore.js';

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-pairing-security-'));

afterAll(() => fs.rmSync(testRoot, { force: true, recursive: true }));

vi.mock('electron', () => ({
  app: { getPath: () => testRoot },
  safeStorage: {
    decryptString: vi.fn(),
    encryptString: vi.fn(),
    getSelectedStorageBackend: () => 'basic_text',
    isEncryptionAvailable: () => true
  }
}));

it.runIf(process.platform === 'linux')('does not create pairing ciphertext with basic_text', () => {
  expect(() => registerPairedCompanionDevice({
    authorizationId: 'authorization-linux-device',
    clientAddress: '127.0.0.1',
    deviceId: 'linux-device',
    deviceKind: 'android',
    deviceName: 'Linux security test',
    hostName: 'Linux security test',
    hostPlatform: 'android',
    negotiatedProtocolVersion: 1,
    remoteProtocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  })).toThrow('Secure system storage is unavailable');
  expect(fs.existsSync(path.join(testRoot, 'companion-paired-devices.bin'))).toBe(false);
});
