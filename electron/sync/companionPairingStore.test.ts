// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedUserDataDir = '/tmp/foliole-companion-pairing-store-tests';

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataDir
  },
  safeStorage: {
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    isEncryptionAvailable: () => true
  }
}));

import {
  clearPairedCompanionDevices,
  countPairedCompanionDevices,
  loadPairedCompanionDevices,
  registerPairedCompanionDevice
} from './companionPairingStore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-pairing-store-'));
  mockedUserDataDir = path.join(tempRoot, 'user-data');
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
