// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { clearSyncPackResourceArticles,
  enqueueSyncIdentityResourceScanPage } from '../../lib/core/sync/syncPackResourceArticles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  setupSyncPackBuilderTestLifecycle } from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));

setupSyncPackBuilderTestLifecycle();

it('schedules a current article for resource verification without an incoming state pack', async () => {
  insertNodeSyncState();
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite);
  const scope = { groupId: 'group', peerId: 'peer', afterId: '' };
  expect(await enqueueSyncIdentityResourceScanPage(port, scope)).toBe('node-1');
  expect(connection.sqlite.prepare('SELECT article_id FROM sync_pack_resource_articles').all())
    .toEqual([{ article_id: 'node-1' }]);
  await clearSyncPackResourceArticles(port, 'group', 'peer', ['node-1']);
  connection.sqlite.exec(`UPDATE sync_object_state SET deleted_at = 'now'
    WHERE object_type = 'node' AND object_id = 'node-1'`);
  expect(await enqueueSyncIdentityResourceScanPage(port, scope)).toBeNull();
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_pack_resource_articles').get())
    .toEqual({ count: 0 });
});
