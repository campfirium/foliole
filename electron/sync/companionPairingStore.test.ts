// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedUserDataDir = '/tmp/foliole-companion-pairing-store-tests';
const safeStorageMock = vi.hoisted(() => ({
  decryptString: vi.fn((value: Buffer) => value.toString('utf8'))
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataDir
  },
  safeStorage: {
    decryptString: safeStorageMock.decryptString,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    isEncryptionAvailable: () => true
  }
}));

import {
  clearPairedCompanionDevices,
  countPairedCompanionDevices,
  loadPairedCompanionDevice,
  loadPairedCompanionDevices,
  registerPairedCompanionDevice
} from './companionPairingStore.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-pairing-store-'));
  mockedUserDataDir = path.join(tempRoot, 'user-data');
  safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf8'));
  clearPairedCompanionDevices();
});

afterEach(async () => {
  clearPairedCompanionDevices();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('replaces an existing paired device with the same device id', () => {
  registerPairedCompanionDevice({
    clientAddress: '127.0.0.1',
    deviceId: 'device-1',
    deviceKind: 'android-capacitor',
    deviceName: 'Android Emulator',
    pairedAt: '2026-05-10T01:00:00.000Z'
  });

  registerPairedCompanionDevice({
    clientAddress: '127.0.0.1',
    deviceId: 'device-1',
    deviceKind: 'android-capacitor',
    deviceName: 'Android Emulator',
    pairedAt: '2026-05-10T02:00:00.000Z'
  });

  expect(countPairedCompanionDevices()).toBe(1);
  expect(loadPairedCompanionDevices()).toEqual([
    expect.objectContaining({
      device_id: 'device-1',
      paired_at: '2026-05-10T02:00:00.000Z'
    })
  ]);
});

it('replaces a re-paired Android device after local data reset changes its device id', () => {
  registerPairedCompanionDevice({
    clientAddress: '127.0.0.1',
    deviceId: 'device-before-reset',
    deviceKind: 'android-capacitor',
    deviceName: 'Android Emulator',
    pairedAt: '2026-05-10T01:00:00.000Z'
  });

  registerPairedCompanionDevice({
    clientAddress: '127.0.0.1',
    deviceId: 'device-after-reset',
    deviceKind: 'android-capacitor',
    deviceName: 'Android Emulator',
    pairedAt: '2026-05-10T02:00:00.000Z'
  });

  expect(countPairedCompanionDevices()).toBe(1);
  expect(loadPairedCompanionDevices()).toEqual([
    expect.objectContaining({
      client_address: '127.0.0.1',
      device_id: 'device-after-reset',
      device_kind: 'android-capacitor',
      device_name: 'Android Emulator'
    })
  ]);
});

it('quarantines an unreadable encrypted paired-device cache and continues unpaired', async () => {
  mockedUserDataDir = path.join(tempRoot, 'corrupt-user-data');
  await fs.mkdir(mockedUserDataDir, { recursive: true });
  const storePath = path.join(mockedUserDataDir, 'companion-paired-devices.bin');
  await fs.writeFile(storePath, Buffer.from('stale-ciphertext'));
  safeStorageMock.decryptString.mockImplementation(() => {
    throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
  });

  expect(countPairedCompanionDevices()).toBe(0);
  expect(loadPairedCompanionDevices()).toEqual([]);
  expect(loadPairedCompanionDevice('android-test-device')).toBeNull();

  await expect(fs.stat(storePath)).rejects.toMatchObject({ code: 'ENOENT' });
  const files = await fs.readdir(mockedUserDataDir);
  expect(files.filter((file) => file.startsWith('companion-paired-devices.bin.corrupt-'))).toHaveLength(1);
});

it('recovers with a fresh encrypted store after quarantining stale paired-device ciphertext', async () => {
  mockedUserDataDir = path.join(tempRoot, 'corrupt-user-data');
  await fs.mkdir(mockedUserDataDir, { recursive: true });
  const storePath = path.join(mockedUserDataDir, 'companion-paired-devices.bin');
  await fs.writeFile(storePath, Buffer.from('stale-ciphertext'));
  safeStorageMock.decryptString.mockImplementationOnce(() => {
    throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
  });

  expect(countPairedCompanionDevices()).toBe(0);
  const paired = registerPairedCompanionDevice({
    clientAddress: '127.0.0.1',
    deviceId: 'device-after-corrupt-cache',
    deviceKind: 'android-capacitor',
    deviceName: 'Android Emulator',
    pairedAt: '2026-05-10T03:00:00.000Z'
  });

  expect(paired.device_id).toBe('device-after-corrupt-cache');
  expect(loadPairedCompanionDevices()).toEqual([
    expect.objectContaining({
      device_id: 'device-after-corrupt-cache',
      paired_at: '2026-05-10T03:00:00.000Z'
    })
  ]);
});

it('rejects signed companion requests as unknown devices when paired-device ciphertext is unreadable', async () => {
  mockedUserDataDir = path.join(tempRoot, 'corrupt-user-data');
  await fs.mkdir(mockedUserDataDir, { recursive: true });
  const storePath = path.join(mockedUserDataDir, 'companion-paired-devices.bin');
  await fs.writeFile(storePath, Buffer.from('stale-ciphertext'));
  safeStorageMock.decryptString.mockImplementation(() => {
    throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
  });

  expect(authenticateCompanionRequest({
    request: {
      headers: {
        'x-device-id': 'android-test-device',
        'x-nonce': 'nonce-1',
        'x-signature': '00',
        'x-timestamp': new Date().toISOString()
      },
      method: 'GET',
      url: '/companion/workspace-version'
    } as never
  })).toEqual({
    error: 'unknown_device',
    ok: false,
    status_code: 401
  });
});
