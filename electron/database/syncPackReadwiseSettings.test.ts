import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { saveJsonSetting } from './settingsStore.js';
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

it('packs the Readwise import tag in the workspace policy setting', async () => {
  saveJsonSetting('import_manager_settings', {
    readwiseAutoImportPolicy: { importTag: 'favorite', version: 3 },
    version: 5
  }, '2026-09-11T00:00:00.000Z');
  const packPath = resolveSyncPackPath('readwise-tag.syncpack');

  await buildDesktopSyncPack({
    createdAt: '2026-09-11T00:01:00.000Z',
    fromPeerId: 'authorization-desktop',
    fromStateSeq: 0,
    outputPath: packPath,
    packId: 'readwise-tag-pack',
    toPeerId: 'android-target'
  });

  const syncObjects = readPackRows(packPath).syncObjects as Array<{
    object_id: string;
    payload_json: string;
  }> | undefined;
  const packed = syncObjects?.find((row) =>
    row.object_id.endsWith(':import_manager_settings'));
  const record = JSON.parse(packed?.payload_json ?? '{}') as { value_json?: string };
  expect(JSON.parse(record.value_json ?? '{}')).toMatchObject({
    readwiseAutoImportPolicy: { importTag: 'favorite', version: 3 }
  });
});
