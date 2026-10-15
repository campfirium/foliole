// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { initiateDesktopSyncGroupDeviceRemoval, loadDesktopSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));

it('rolls back the entire removal when its durable confirmation cannot be saved', () => {
  const database = new Database(':memory:');
  try {
    initializeDatabaseSchema(database);
    connection.current = { driver: createBetterSqlite3Driver(database) };
    const identities = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
      .map((anchor, index) => createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'rollback',
        library_path: `/isolated/${index}`, path_flavor: 'posix' }));
    createDesktopSyncGroup({ device: identities[0]!, deviceName: 'Mac', platform: 'darwin' });
    registerSyncGroupDevice({ device: identities[1]!, deviceName: 'Phone', platform: 'ios-capacitor' });
    const before = loadDesktopSyncGroupMemberState();
    database.exec(`CREATE TRIGGER fail_confirmation BEFORE INSERT ON sync_group_removal_confirmations
      BEGIN SELECT RAISE(ABORT, 'confirmation_write_failed'); END`);
    expect(() => initiateDesktopSyncGroupDeviceRemoval(identities[1]!.identity_key)).toThrow('confirmation_write_failed');
    expect(loadDesktopSyncGroupMemberState()).toEqual(before);
    expect(database.prepare('SELECT COUNT(*) FROM sync_group_removal_decisions').pluck().get()).toBe(0);
  } finally { database.close(); }
});
