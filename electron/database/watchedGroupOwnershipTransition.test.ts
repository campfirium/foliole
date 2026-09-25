// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createDesktopSyncGroup, leaveDesktopSyncGroupDevice } from './syncGroupStore.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));

const db = new Database(':memory:');
initializeDatabaseSchema(db);
connection.current = { driver: createBetterSqlite3Driver(db) };
afterEach(() => db.exec(`DELETE FROM sync_group_local_state; DELETE FROM sync_group_devices;
  DELETE FROM sync_groups; DELETE FROM watched_folder_bindings; DELETE FROM desktop_sources;
  DELETE FROM sync_object_state; DELETE FROM settings`));

it('moves a standalone watched source to the new group device and back without changing its ID', () => {
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('device_id', ?, 'old')")
    .run(JSON.stringify('standalone-device'));
  db.prepare(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path,
     path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('watched:local-source', 'watched', 'local-source', 'This Mac', 'darwin',
      '/Users/test/Articles', 'posix', '{}', 'old', 'old')`).run();
  db.prepare(`INSERT INTO watched_folder_bindings
    (binding_id, connection_status, action_mode, highlight_mode, primary_path,
     local_rule_id, reported_path, created_at, updated_at, source_ref, owner_device_identity_key)
    VALUES ('local-source', 'needs-folder', 'keep', 'merged', '/Users/test/Articles',
      'draft-import-source-101', '/Users/test/Articles', 'old', 'old',
      'watched:local-source', 'standalone-device')`).run();
  const device = createSyncGroupDeviceIdentity({
    device_anchor: '7debea90-baf0-4f85-9481-31aefaf59496', group_id: 'group-1',
    library_path: '/library/local', path_flavor: 'posix'
  });
  createDesktopSyncGroup({ device, deviceName: 'This Mac', platform: 'darwin' });
  expect(db.prepare(`SELECT binding_id, owner_device_identity_key FROM watched_folder_bindings`).get())
    .toEqual({ binding_id: 'local-source', owner_device_identity_key: device.identity_key });
  expect(db.prepare(`SELECT sync_dirty FROM sync_object_state WHERE object_type = 'watched_folder'
    AND object_id = 'local-source'`).get()).toEqual({ sync_dirty: 1 });
  leaveDesktopSyncGroupDevice(device.identity_key);
  expect(db.prepare(`SELECT binding_id, owner_device_identity_key FROM watched_folder_bindings`).get())
    .toEqual({ binding_id: 'local-source', owner_device_identity_key: 'standalone-device' });
});
