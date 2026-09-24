// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { openDatabaseConnection } from './connection.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
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

  const firstPath = resolveSyncPackPath('restored-readwise-first.syncpack');
  const first = await buildDesktopSyncPack({
    fromPeerId: 'windows-device', fromStateSeq: 0, outputPath: firstPath,
    packId: 'restored-readwise-first', toPeerId: 'mac-device'
  });
  const firstRows = readPackRows(firstPath);
  expect(firstRows.nodes).toContainEqual(expect.objectContaining({
    id: 'restored-readwise-topic'
  }));
  expect(firstRows.nodeVersions).toContainEqual(expect.objectContaining({
    object_id: 'restored-readwise-topic', body_text: 'Imported article body',
    snapshot_json: expect.stringContaining('Restored Readwise topic')
  }));
  expect(firstRows.stateRows).toContainEqual(expect.objectContaining({
    object_type: 'node', object_id: 'restored-readwise-topic'
  }));

  const secondPath = resolveSyncPackPath('restored-readwise-second.syncpack');
  await buildDesktopSyncPack({
    fromPeerId: 'windows-device', fromStateSeq: first.toStateSeq, outputPath: secondPath,
    packId: 'restored-readwise-second', toPeerId: 'mac-device'
  });
  expect(readPackRows(secondPath).nodes).toEqual([]);
});
