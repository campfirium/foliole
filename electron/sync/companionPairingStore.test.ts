// @vitest-environment node

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

vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ group_id: 'group-1' }),
  loadSyncGroupMemberAuthorization: () => ({ state: 'active' })
}));

import {
  clearPairedCompanionAuthorizations,
  countPairedCompanionAuthorizations,
  loadPairedCompanionAuthorizations,
  registerPairedCompanionAuthorization
} from './companionPairingStore.js';

let tempRoot = '';
const protocolArgs = {
  authorizationId: 'authorization-1',
  hostName: 'Android Emulator',
  hostPlatform: 'android-capacitor',
  negotiatedProtocolVersion: 1,
  remoteProtocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
};

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-pairing-store-'));
  mockedUserDataDir = path.join(tempRoot, 'user-data');
  safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf8'));
  clearPairedCompanionAuthorizations();
});

afterEach(async () => {
  clearPairedCompanionAuthorizations();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('replaces an existing paired credential with the same authorization id', () => {
  registerPairedCompanionAuthorization({
    ...protocolArgs,
    authorizationId: 'authorization-1',
    clientAddress: '127.0.0.1',
    pairedAt: '2026-05-10T01:00:00.000Z'
  });

  registerPairedCompanionAuthorization({
    ...protocolArgs,
    authorizationId: 'authorization-1',
    clientAddress: '127.0.0.1',
    pairedAt: '2026-05-10T02:00:00.000Z'
  });

  expect(countPairedCompanionAuthorizations()).toBe(1);
  expect(loadPairedCompanionAuthorizations()).toEqual([
    expect.objectContaining({
      authorization_id: 'authorization-1',
      paired_at: '2026-05-10T02:00:00.000Z'
    })
  ]);
});

it('keeps paired credentials with different authorization ids when their LAN labels match', () => {
  registerPairedCompanionAuthorization({
    ...protocolArgs,
    authorizationId: 'authorization-before-reset',
    clientAddress: '127.0.0.1',
    pairedAt: '2026-05-10T01:00:00.000Z'
  });

  registerPairedCompanionAuthorization({
    ...protocolArgs,
    authorizationId: 'authorization-after-reset',
    clientAddress: '127.0.0.1',
    pairedAt: '2026-05-10T02:00:00.000Z'
  });

  expect(countPairedCompanionAuthorizations()).toBe(2);
  expect(loadPairedCompanionAuthorizations()).toEqual([
    expect.objectContaining({
      client_address: '127.0.0.1',
      authorization_id: 'authorization-before-reset',
      host_name: 'Android Emulator',
      host_platform: 'android-capacitor'
    }),
    expect.objectContaining({
      client_address: '127.0.0.1',
      authorization_id: 'authorization-after-reset',
      host_name: 'Android Emulator',
      host_platform: 'android-capacitor'
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

  expect(countPairedCompanionAuthorizations()).toBe(0);
  expect(loadPairedCompanionAuthorizations()).toEqual([]);

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

  expect(countPairedCompanionAuthorizations()).toBe(0);
  const paired = registerPairedCompanionAuthorization({
    ...protocolArgs,
    clientAddress: '127.0.0.1',
    pairedAt: '2026-05-10T03:00:00.000Z'
  });

  expect(paired.authorization_id).toBe('authorization-1');
  expect(loadPairedCompanionAuthorizations()).toEqual([
    expect.objectContaining({
      authorization_id: 'authorization-1',
      paired_at: '2026-05-10T03:00:00.000Z'
    })
  ]);
});
