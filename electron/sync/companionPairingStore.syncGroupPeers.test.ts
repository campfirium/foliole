// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let userDataDir = '';
const encryptString = vi.hoisted(() => vi.fn((value: string) => Buffer.from(value, 'utf8')));

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    isEncryptionAvailable: () => true
  }
}));

import {
  clearPairedCompanionDevices,
  loadPairedSyncGroupPeer,
  loadPairedSyncGroupPeers,
  savePairedSyncGroupPeer
} from './companionPairingStore.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-group-peers-'));
  userDataDir = path.join(tempRoot, 'user-data');
  clearPairedCompanionDevices();
});

afterEach(async () => {
  clearPairedCompanionDevices();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps one persistent transfer channel for each peer in the same Sync Group', () => {
  savePairedSyncGroupPeer(peer('desktop-a', 'secret-a', 'http://a.local'));
  savePairedSyncGroupPeer(peer('desktop-c', 'secret-c', 'http://c.local'));

  expect(loadPairedSyncGroupPeers('group-1')).toEqual([
    expect.objectContaining({ peer_device_id: 'desktop-a', secret: 'secret-a' }),
    expect.objectContaining({ peer_device_id: 'desktop-c', secret: 'secret-c' })
  ]);
});

it('replaces only the same peer channel and requires an exact peer lookup', () => {
  savePairedSyncGroupPeer(peer('desktop-a', 'secret-old', 'http://old.local'));
  savePairedSyncGroupPeer(peer('desktop-c', 'secret-c', 'http://c.local'));
  savePairedSyncGroupPeer(peer('desktop-a', 'secret-new', 'http://new.local'));

  expect(loadPairedSyncGroupPeers('group-1')).toHaveLength(2);
  expect(loadPairedSyncGroupPeer('group-1', 'desktop-a')).toEqual(
    expect.objectContaining({ endpoint_url: 'http://new.local', secret: 'secret-new' })
  );
  expect(loadPairedSyncGroupPeer('group-1', 'missing')).toBeNull();
});

it('clears credentials by deleting the store without encrypting an empty replacement', async () => {
  savePairedSyncGroupPeer(peer('desktop-a', 'secret-a', 'http://a.local'));
  const storePath = path.join(userDataDir, 'companion-paired-devices.bin');
  expect((await fs.stat(storePath)).isFile()).toBe(true);
  encryptString.mockClear();
  clearPairedCompanionDevices();
  expect(encryptString).not.toHaveBeenCalled();
  await expect(fs.stat(storePath)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(loadPairedSyncGroupPeers('group-1')).toEqual([]);
});

function peer(peerDeviceId: string, secret: string, endpointUrl: string) {
  return {
    endpoint_url: endpointUrl,
    group_id: 'group-1',
    local_device_id: 'local-device',
    peer_device_id: peerDeviceId,
    peer_device_kind: 'desktop',
    peer_device_name: peerDeviceId,
    secret,
    timeline_id: 'timeline-1'
  };
}
