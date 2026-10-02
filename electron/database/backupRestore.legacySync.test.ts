// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(root, 'data'), app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

import { createSyncGroupDeviceIdentity, devicePathFlavorFromCanonicalLibraryPath } from '../../lib/platform/syncGroupUnifiedContract.js';

import { restoreApplicationDatabaseBackup } from './backupRestore.js';
import { loadBackupRestorePendingSync } from './backupRestorePendingSync.js';
import { inspectBackupRestoreSync } from './backupRestoreSyncPreview.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabase } from './migrate.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup } from './syncGroupStore.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-legacy-restore-'));
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', root);
  initializeDatabase();
  const identity = createSyncGroupDeviceIdentity({ device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: 'current', library_path: openDatabaseConnection().dbPath,
    path_flavor: devicePathFlavorFromCanonicalLibraryPath(openDatabaseConnection().dbPath) });
  createDesktopSyncGroup({ device: identity, deviceName: 'This desktop', displayName: 'Current group',
    platform: 'darwin', workgroupKey: Buffer.alloc(32, 7).toString('base64url') });
});
afterEach(async () => {
  closeDatabaseConnection();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

const cases = [46, 48, 61, 62, 65, 66, 77, 78].flatMap((schema) =>
  (['backup', 'current'] as const).flatMap((source) =>
    ([65, 77].includes(schema) ? [false, true] : [false]).flatMap((populated) =>
      (schema === 77 ? [false, true] : [false]).map((compressed) => ({ schema, source, populated, compressed })))));
it.each(cases)('restores schema $schema using $source settings, populated=$populated, compressed=$compressed',
  async ({ schema, source, populated, compressed }) => {
    let file = path.join(root, 'historical.db');
    await fs.copyFile(path.resolve(`electron/database/fixtures/public-desktop-main/schema-${schema}/foliole.db`), file);
    if (populated) populateLegacyGroup(file, schema);
    if (compressed) {
      await fs.writeFile(`${file}.gz`, gzipSync(await fs.readFile(file)));
      file = `${file}.gz`;
    }
    const digest = async () => createHash('sha256').update(await fs.readFile(file)).digest('hex');
    const before = await digest();
    const preview = await inspectBackupRestoreSync(file);
    expect(preview.backup.group).toBeNull();
    expect(preview.current.group?.id).toBe('current');
    expect(loadDesktopSyncGroup()?.group_id).toBe('current');
    await restoreApplicationDatabaseBackup({ sourcePath: file,
      choice: { source, action: source === 'backup' ? 'local' : 'pause', revision: preview.revision } });
    expect(loadWorkspaceSnapshot({ includeBody: true })?.nodesById['t166-root']?.content)
      .toBe('# Stable user content');
    expect(loadDesktopSyncGroup()?.group_id ?? null).toBe(source === 'current' ? 'current' : null);
    expect(loadBackupRestorePendingSync()?.groupId ?? null).toBe(source === 'current' ? 'current' : null);
    expect(openDatabaseConnection().sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    closeDatabaseConnection();
    initializeDatabase();
    expect(loadDesktopSyncGroup()?.group_id ?? null).toBe(source === 'current' ? 'current' : null);
    expect(await digest()).toBe(before);
  });

function populateLegacyGroup(file: string, schema: number) {
  const sqlite = new Database(file);
  try {
    const identityColumn = schema === 65 ? 'created_by_device_id' : 'created_by_host_name';
    const localColumn = schema === 65 ? 'local_device_id' : 'local_host_name';
    sqlite.prepare(`INSERT INTO sync_groups
      (group_id, display_name, timeline_id, ${identityColumn}, created_at, updated_at)
      VALUES ('legacy', 'Legacy group', 'legacy-timeline', 'Legacy desktop', 'then', 'then')`).run();
    sqlite.prepare(`INSERT INTO sync_group_local_state
      (singleton_id, group_id, ${localColumn}, member_state, updated_at)
      VALUES (1, 'legacy', 'Legacy desktop', 'active', 'then')`).run();
  } finally { sqlite.close(); }
}
