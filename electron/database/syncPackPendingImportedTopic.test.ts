// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';

import { openDatabaseConnection } from './connection.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { flushDirtyNodeSyncVersions } from './nodeSyncVersions.js';
import { mockedRequestProjectionAppDataDir, ownerPort, projectionPeer,
  setupRequestProjection, transferProjection } from './requestProjection.testSupport.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedRequestProjectionAppDataDir,
    app_cache_dir: path.join(mockedRequestProjectionAppDataDir, 'cache'),
    app_config_dir: path.join(mockedRequestProjectionAppDataDir, 'config'),
    app_log_dir: path.join(mockedRequestProjectionAppDataDir, 'logs')
  })
}));

setupRequestProjection();

it('sends an imported topic that was still unversioned when the library was restored', async () => {
  upsertNodeSnapshot({
    nodeId: 'restored-readwise-topic',
    parentNodeId: 'special-inbox',
    kind: 'topic',
    title: 'Restored Readwise topic',
    isTitleManual: false,
    content: 'Imported article body',
    reveal: null,
    anchorLink: null,
    imageRegions: null,
    position: 0,
    createdAt: '2026-09-24T04:10:34.195Z',
    updatedAt: '2026-09-24T04:10:34.195Z'
  });
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE nodes SET import_source_fingerprint = 'readwise-source' WHERE id = 'restored-readwise-topic'");
  expect(driver.queryOne<{ current_version_id: string | null; sync_dirty: number }>(
    "SELECT current_version_id, sync_dirty FROM nodes WHERE id='restored-readwise-topic'"
  )).toEqual({ current_version_id: null, sync_dirty: 1 });

  flushDirtyNodeSyncVersions();
  const target = projectionPeer('target');
  await transferProjection(ownerPort(), target.db);
  target.reopen();
  expect(target.sqlite.prepare("SELECT id, title, content FROM nodes WHERE id = 'restored-readwise-topic'").get())
    .toEqual({ id: 'restored-readwise-topic', title: 'Restored Readwise topic', content: 'Imported article body' });
  expect(target.sqlite.prepare("SELECT object_id, body_text, snapshot_json FROM node_sync_versions WHERE object_id = 'restored-readwise-topic'").get())
    .toMatchObject({ object_id: 'restored-readwise-topic', body_text: 'Imported article body',
      snapshot_json: expect.stringContaining('Restored Readwise topic') });
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(ownerPort()),
    remote: await readFramedSyncInventory(target.db) });
  expect(differences.filter(entry => entry.objectType === 'node')).toEqual([]);
});
