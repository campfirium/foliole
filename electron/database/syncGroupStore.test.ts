import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { updateLocalSyncGroupHostName } from './syncGroupIdentityStore.js';
import {
  createDesktopSyncGroup,
  leaveDesktopSyncGroupDevice,
  loadDesktopSyncGroup,
  registerSyncGroupDevice
} from './syncGroupStore.js';
import { consumeDesktopSyncGroupNonce, loadDesktopSyncGroupWorkgroupKey } from './syncGroupWorkgroupStore.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));

let sqlite: Database.Database;
const local = identity('group-1', '7debea90-baf0-4f85-9481-31aefaf59496', '/library/local');
const remote = identity('group-1', '761c482c-97aa-470f-9533-fb38ed8a24a0', '/library/remote');

function identity(groupId: string, deviceAnchor: string, libraryPath: string) {
  return createSyncGroupDeviceIdentity({
    device_anchor: deviceAnchor, group_id: groupId, library_path: libraryPath, path_flavor: 'posix'
  });
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec('CREATE TABLE sync_delivery_receipts (peer_id TEXT)');
  sqlite.exec('CREATE TABLE sync_peer_cursors (peer_id TEXT)');
  connection.current = { driver: createBetterSqlite3Driver(sqlite) };
});

afterEach(() => sqlite.close());

it('persists one Group with stable local and remote Device identities', () => {
  const group = createDesktopSyncGroup({
    device: local, deviceName: 'Mac', displayName: 'Studio', now: '2026-08-26T00:00:00.000Z',
    platform: 'darwin', workgroupKey: Buffer.alloc(32, 3).toString('base64url')
  });
  registerSyncGroupDevice({ device: remote, deviceName: 'A5', platform: 'android-capacitor' });
  expect(loadDesktopSyncGroup()).toMatchObject({
    group_id: group.group_id, local_device_identity_key: local.identity_key,
    devices: expect.arrayContaining([
      expect.objectContaining({ device_identity_key: local.identity_key, state: 'active' }),
      expect.objectContaining({ device_identity_key: remote.identity_key, state: 'active' })
    ])
  });
  expect(loadDesktopSyncGroupWorkgroupKey(group.group_id)).toBe(Buffer.alloc(32, 3).toString('base64url'));
  expect(consumeDesktopSyncGroupNonce(group.group_id, 'nonce-1', 100, 200)).toBe(true);
  expect(consumeDesktopSyncGroupNonce(group.group_id, 'nonce-1', 100, 200)).toBe(false);
});

it('updates the local Device name and locally leaving removes only the active binding', () => {
  createDesktopSyncGroup({ device: local, deviceName: 'Mac', platform: 'darwin' });
  registerSyncGroupDevice({ device: remote, deviceName: 'A5', platform: 'android-capacitor' });
  expect(updateLocalSyncGroupHostName('Studio Mac')?.devices.find(
    (device) => device.device_identity_key === local.identity_key
  )?.device_name).toBe('Studio Mac');
  sqlite.exec("INSERT INTO sync_delivery_receipts VALUES ('device-a5')");
  sqlite.exec("INSERT INTO sync_peer_cursors VALUES ('device-a5')");
  leaveDesktopSyncGroupDevice(local.identity_key, '2026-08-26T01:00:00.000Z');
  expect(loadDesktopSyncGroup()).toBeNull();
  expect(sqlite.prepare('SELECT state FROM sync_group_devices WHERE device_identity_key = ?').get(remote.identity_key))
    .toEqual({ state: 'active' });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM sync_delivery_receipts').get()).toEqual({ value: 0 });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM sync_peer_cursors').get()).toEqual({ value: 0 });
});
