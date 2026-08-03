// @vitest-environment node

import { createHash, createHmac } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

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
    getSelectedStorageBackend: () => 'gnome_libsecret',
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
const protocolArgs = {
  negotiatedProtocolVersion: 1,
  remoteProtocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
};

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
    ...protocolArgs,
    clientAddress: '127.0.0.1',
    deviceId: 'device-1',
    deviceKind: 'android-capacitor',
    deviceName: 'Android Emulator',
    pairedAt: '2026-05-10T01:00:00.000Z'
  });

  registerPairedCompanionDevice({
    ...protocolArgs,
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

it('keeps paired devices with different ids even when their LAN labels match', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const beforeReset = registerPairedCompanionDevice({
    ...protocolArgs,
    clientAddress: '127.0.0.1',
    deviceId: 'device-before-reset',
    deviceKind: 'android-capacitor',
    deviceName: 'Android Emulator',
    pairedAt: '2026-05-10T01:00:00.000Z'
  });

  registerPairedCompanionDevice({
    ...protocolArgs,
    clientAddress: '127.0.0.1',
    deviceId: 'device-after-reset',
    deviceKind: 'android-capacitor',
    deviceName: 'Android Emulator',
    pairedAt: '2026-05-10T02:00:00.000Z'
  });

  expect(countPairedCompanionDevices()).toBe(2);
  expect(loadPairedCompanionDevices()).toEqual([
    expect.objectContaining({
      client_address: '127.0.0.1',
      device_id: 'device-before-reset',
      device_kind: 'android-capacitor',
      device_name: 'Android Emulator'
    }),
    expect.objectContaining({
      client_address: '127.0.0.1',
      device_id: 'device-after-reset',
      device_kind: 'android-capacitor',
      device_name: 'Android Emulator'
    })
  ]);
  expect(warnSpy).toHaveBeenCalledWith(
    '[companion-sync] paired companion device has matching LAN label with a different device id',
    expect.objectContaining({ deviceKind: 'android-capacitor' })
  );
  expect(authenticateCompanionRequest({
    nowMs: Date.parse('2026-05-10T01:00:30.000Z'),
    request: createSignedRequest({
      deviceId: 'device-before-reset',
      deviceSecret: beforeReset.device_secret,
      nonce: 'nonce-before-reset',
      timestamp: '2026-05-10T01:00:30.000Z'
    })
  })).toEqual({
    device_id: 'device-before-reset',
    ok: true
  });
  warnSpy.mockRestore();
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
    ...protocolArgs,
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

function createSignedRequest(args: {
  deviceId: string;
  deviceSecret: string;
  nonce: string;
  timestamp: string;
}) {
  const bodyHash = createHash('sha256').update('').digest('hex');
  const canonicalPayload = ['GET', '/companion/workspace-version', args.timestamp, args.nonce, bodyHash].join('\n');
  const signature = createHmac('sha256', args.deviceSecret).update(canonicalPayload).digest('hex');
  return {
    headers: {
      'x-device-id': args.deviceId,
      'x-nonce': args.nonce,
      'x-signature': signature,
      'x-timestamp': args.timestamp
    },
    method: 'GET',
    url: '/companion/workspace-version'
  } as never;
}
