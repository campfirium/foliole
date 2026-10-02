// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { createDesktopSyncGroup } from './syncGroupStore.js';

afterEach(async () => {
  closeDatabaseConnection();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

it('does not restore or publish into a group until the user chooses the sync outcome', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-authorization-'));
  initializeDatabase();
  const backup = await createApplicationDatabaseBackup();
  const identity = createSyncGroupDeviceIdentity({ device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: 'authorization-test', library_path: '/test/library', path_flavor: 'posix' });
  createDesktopSyncGroup({ device: identity, deviceName: 'Local test', platform: 'darwin',
    workgroupKey: Buffer.alloc(32, 7).toString('base64url') });
  await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath })).rejects.toThrow();
});
