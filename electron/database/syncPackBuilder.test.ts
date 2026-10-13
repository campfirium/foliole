import path from 'node:path';

import { expect, it, vi } from 'vitest';

import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { openDatabaseConnection } from './connection.js';
import { upsertExternalDocuments } from './externalDocuments.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { flushDirtyNodeSyncVersions } from './nodeSyncVersions.js';
import { mockedRequestProjectionAppDataDir, ownerPort, projectionPeer,
  setupRequestProjection, transferProjection } from './requestProjection.testSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedRequestProjectionAppDataDir,
  app_cache_dir: path.join(mockedRequestProjectionAppDataDir, 'cache'),
  app_config_dir: path.join(mockedRequestProjectionAppDataDir, 'config'),
  app_log_dir: path.join(mockedRequestProjectionAppDataDir, 'logs')
}) }));
setupRequestProjection();

it('transfers original versions from an isolated source without reading the desktop connection', async () => {
  const source = projectionPeer('source'); const target = projectionPeer('target');
  const driver = createBetterSqlite3Driver(source.sqlite);
  source.sqlite.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('isolated-node', 'topic', 'First', '', '2026-07-20', '2026-07-20')`);
  flushNodeSyncVersionWithDriver(driver, 'isolated-node', 'desktop', '2026-07-20T00:00:00Z', 'desktop#isolated-v1');
  source.sqlite.exec("UPDATE nodes SET title = 'Isolated', sync_dirty = 1, updated_at = '2026-07-21' WHERE id = 'isolated-node'");
  flushNodeSyncVersionWithDriver(driver, 'isolated-node', 'desktop', '2026-07-21T00:00:00Z', 'desktop#isolated-v2');
  expect(openDatabaseConnection().sqlite.prepare('SELECT id FROM nodes').all()).toEqual([]);
  await transferProjection(source.db, target.db);
  expect(target.sqlite.prepare('SELECT version_id, parent_version_id FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([{ version_id: 'desktop#isolated-v1', parent_version_id: null },
      { version_id: 'desktop#isolated-v2', parent_version_id: 'desktop#isolated-v1' }]);
  expect(target.sqlite.prepare('SELECT id, title, current_version_id FROM nodes').get())
    .toEqual({ id: 'isolated-node', title: 'Isolated', current_version_id: 'desktop#isolated-v2' });
});

it('repairs missing derived state before publishing the original node version', async () => {
  const source = openDatabaseConnection(); const target = projectionPeer('target');
  source.sqlite.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('node-backfill', 'topic', 'Backfilled node', '', '2026-04-27', '2026-04-27')`);
  flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(source.sqlite), 'node-backfill', 'android',
    '2026-04-27T03:00:00Z', 'android#node-v1');
  source.sqlite.exec("DELETE FROM sync_object_state WHERE object_type = 'node'");
  expect(flushDirtyNodeSyncVersions()).toContain('node-backfill');
  await transferProjection(ownerPort(), target.db);
  target.reopen();
  expect(target.sqlite.prepare('SELECT id, current_version_id FROM nodes').get())
    .toEqual({ id: 'node-backfill', current_version_id: 'android#node-v1' });
});

it('transfers complete external document text with its original identity', async () => {
  const folder: NativeExternalSearchFolder = {
    attachment_mode: 'document_relative', attachment_root_path: null, created_at: '2026-04-27T00:00:00.000Z',
    document_count: 0, excluded_dirs: [], folder_path: '/library', id: 'folder-1', indexed_at: null,
    last_error: null, status: 'ready', updated_at: '2026-04-27T00:00:00.000Z'
  };
  const body = '# External Doc\n\nOwned external body';
  upsertExternalDocuments(folder, [{ absolutePath: '/library/doc.md', content: body, extension: 'md',
    fileName: 'doc.md', modifiedAt: '2026-04-27T00:00:00.000Z', modifiedMs: 1777,
    relativePath: 'doc.md', sizeBytes: 48 }], '2026-04-27T00:00:00.000Z');
  const target = projectionPeer('target');
  await transferProjection(ownerPort(), target.db);
  target.reopen();
  expect(target.sqlite.prepare('SELECT document_id, content, body_blob_hash, opening_text FROM external_documents').get())
    .toEqual({ document_id: 'folder-1:doc.md', content: body, body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      opening_text: expect.stringContaining('Owned external body') });
  upsertExternalDocuments(folder, [{ absolutePath: '/library/doc.md', content: '# External Doc\n\nChanged opening',
    extension: 'md', fileName: 'doc.md', modifiedAt: '2026-04-28T00:00:00.000Z', modifiedMs: 1778,
    relativePath: 'doc.md', sizeBytes: 40 }], '2026-04-28T00:00:00.000Z');
  await transferProjection(ownerPort(), target.db);
  target.reopen();
  expect(target.sqlite.prepare('SELECT content, opening_text FROM external_documents').get())
    .toEqual({ content: '# External Doc\n\nChanged opening', opening_text: 'Changed opening' });
});
