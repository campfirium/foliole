import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let deviceRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: deviceRoot,
  app_config_dir: path.join(deviceRoot, 'config'), app_cache_dir: path.join(deviceRoot, 'cache'),
  app_log_dir: path.join(deviceRoot, 'logs') }) }));

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { applyDesktopSyncGroupMemberState, loadDesktopSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';
import { upsertChangedWatchedFolderSource } from './watchedFolderBindings.js';

const members = [0, 1].map(index => createSyncGroupDeviceIdentity({ group_id: 'group',
  device_anchor: index ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111',
  library_path: `/library/${index}`, path_flavor: 'posix' }));
function select(index: number) {
  closeDatabaseConnection();
  deviceRoot = path.join(root, String(index));
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'watched-member-hints-'));
  for (const index of [0, 1]) {
    select(index);
    initializeDatabase();
    createDesktopSyncGroup({ device: members[index]!, deviceName: `Device ${index}`, platform: 'darwin' });
    registerSyncGroupDevice({ device: members[1 - index]!, deviceName: `Device ${1 - index}`, platform: 'darwin' });
  }
});
afterEach(async () => { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

function sourceAndDelayedState() {
  select(0);
  const binding = upsertChangedWatchedFolderSource({ id: 'rule', primaryPath: root, actionMode: 'keep',
    archivePath: '', highlightMode: 'merged', highlightPath: '', keepPreview: null, keepState: 'enabled' }, '2026-10-01')!;
  const driver = openDatabaseConnection().driver;
  const payload = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder, [binding.binding_id])!;
  driver.execute("UPDATE sync_group_devices SET device_name = 'Fresh name', updated_at = '2099-01-01' WHERE device_identity_key = ?",
    [members[0]!.identity_key]);
  const delayed = loadDesktopSyncGroupMemberState();
  delayed.watched_sources!.forEach(source => { source.updated_at = '2099-01-01'; });
  return { binding, delayed, payload: JSON.parse(payload.payload_json) };
}

it.each(['reassigned', 'same-owner', 'deleted'] as const)(
  'keeps the canonical %s source while accepting unrelated member updates', async mode => {
    const { binding, delayed, payload } = sourceAndDelayedState();
    select(1);
    const db = openDatabaseConnection();
    const canonical = { ...payload, action_mode: 'delete',
      owner_device_identity_key: members[mode === 'reassigned' ? 1 : 0]!.identity_key };
    await applySyncObjectInTransaction(createBetterSqliteDbPort(db.sqlite), {
      object_type: 'watched_folder', object_id: binding.binding_id,
      payload_json: JSON.stringify(canonical), updated_at: '2026-10-02', deleted_at: null,
      content_hash: computeSyncContentHash('watched_folder', canonical)
    });
    if (mode === 'deleted') await applySyncObjectInTransaction(createBetterSqliteDbPort(db.sqlite), {
      object_type: 'watched_folder', object_id: binding.binding_id, payload_json: null,
      updated_at: '2026-10-03', deleted_at: '2026-10-03', content_hash: 'deleted-source'
    });
    const before = db.driver.queryOne('SELECT * FROM watched_folder_bindings WHERE binding_id = ?', [binding.binding_id]);
    expect(() => applyDesktopSyncGroupMemberState(delayed, members[0]!.identity_key)).not.toThrow();
    expect(db.driver.queryOne('SELECT * FROM watched_folder_bindings WHERE binding_id = ?', [binding.binding_id])).toEqual(before);
    expect(db.driver.queryOne('SELECT device_name FROM sync_group_devices WHERE device_identity_key = ?',
      [members[0]!.identity_key])).toEqual({ device_name: 'Fresh name' });
    closeDatabaseConnection();
    expect(openDatabaseConnection().driver.queryOne('SELECT * FROM watched_folder_bindings WHERE binding_id = ?',
      [binding.binding_id])).toEqual(before);
  }
);
