import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';
import {
  mockedSyncPackBuilderAppDataDir,
  readPackRows,
  resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedSyncPackBuilderAppDataDir,
    app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
    app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
    app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
  })
}));

setupSyncPackBuilderTestLifecycle();

it('packs prior permanent deletions after their state cursor has passed', async () => {
  const db = openDatabaseConnection().sqlite;
  const deletedAt = '2026-08-16T00:00:00.000Z';
  db.prepare(`INSERT INTO node_sync_tombstones (
    node_id, version_id, parent_version_id, host_name, content_hash,
    snapshot_json, deleted_at, created_at
  ) VALUES ('prior-deletion', 'desktop#deleted', NULL, 'desktop', 'deleted-hash', ?, ?, ?)`).run(
    JSON.stringify({ id: 'prior-deletion', deleted_at: deletedAt }), deletedAt, deletedAt
  );
  const packPath = resolveSyncPackPath('prior-deletion.syncpack');
  await buildDesktopSyncPack({
    fromPeerId: 'desktop', fromStateSeq: 1, outputPath: packPath,
    packId: 'prior-deletion-pack', toPeerId: 'peer'
  });
  expect(readPackRows(packPath)).toMatchObject({
    manifest: expect.objectContaining({
      tables: expect.arrayContaining([{ name: 'node_sync_tombstones', row_count: 1 }])
    }),
    nodeTombstones: [{ node_id: 'prior-deletion', version_id: 'desktop#deleted', deleted_at: deletedAt }]
  });
});
