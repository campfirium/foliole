import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { applyDesktopSyncGroupMemberState, loadDesktopSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));
const databases: Database.Database[] = [];
const identities = [1, 2].map(index => createSyncGroupDeviceIdentity({
  device_anchor: `${index}`.repeat(8) + '-1111-4111-8111-111111111111',
  group_id: 'names-group', library_path: `/library/${index}`, path_flavor: 'posix'
}));
afterEach(() => databases.splice(0).forEach(database => database.close()));

function use(database: Database.Database) {
  connection.current = { driver: createBetterSqlite3Driver(database) };
}

function createDevice(index: number) {
  const database = new Database(':memory:');
  databases.push(database);
  initializeDatabaseSchema(database);
  use(database);
  createDesktopSyncGroup({ device: identities[index]!, deviceName: `Device ${index}`,
    platform: 'desktop', workgroupKey: Buffer.alloc(32, 4).toString('base64url') });
  registerSyncGroupDevice({ device: identities[1 - index]!, deviceName: 'Peer', platform: 'desktop' });
  database.prepare('UPDATE sync_group_devices SET updated_at = ?').run('2026-01-01T00:00:00.000Z');
  return database;
}

it('preserves the local name while accepting newer peer names and rejecting delayed updates', () => {
  const a = createDevice(0);
  const b = createDevice(1);
  const incoming = loadDesktopSyncGroupMemberState();
  const local = incoming.devices.find(device => device.device_identity_key === identities[0]!.identity_key)!;
  const peer = incoming.devices.find(device => device.device_identity_key === identities[1]!.identity_key)!;
  local.device_name = 'Remote overwrite';
  local.updated_at = '2026-03-01T00:00:00.000Z';
  peer.device_name = 'Renamed peer';
  peer.updated_at = '2026-02-01T00:00:00.000Z';
  use(a);
  applyDesktopSyncGroupMemberState(incoming, identities[1]!.identity_key);
  let state = loadDesktopSyncGroupMemberState();
  expect(state.devices.find(device => device.device_identity_key === local.device_identity_key)?.device_name)
    .toBe('Device 0');
  expect(state.devices.find(device => device.device_identity_key === peer.device_identity_key))
    .toMatchObject({ device_name: 'Renamed peer', updated_at: peer.updated_at });
  peer.device_name = 'Delayed old name';
  peer.updated_at = '2026-01-15T00:00:00.000Z';
  applyDesktopSyncGroupMemberState(incoming, identities[1]!.identity_key);
  state = loadDesktopSyncGroupMemberState();
  expect(state.devices.find(device => device.device_identity_key === peer.device_identity_key)?.device_name)
    .toBe('Renamed peer');
  use(b);
  applyDesktopSyncGroupMemberState(state, identities[0]!.identity_key);
  expect(loadDesktopSyncGroupMemberState().devices.find(device => device.device_identity_key === peer.device_identity_key)?.device_name)
    .toBe('Device 1');
});
