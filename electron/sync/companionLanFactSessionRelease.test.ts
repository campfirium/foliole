// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { sessionRoot } from './companionLanDependencySession.js';
import { createCompanionFactSession,
  releaseConfirmedCompanionFactSession } from './companionLanFactSession.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
setupSyncPackBuilderTestLifecycle();

it('releases a confirmed fact-only source view after its holds are gone', async () => {
  insertNodeSyncState();
  const state = openDatabaseConnection().driver.queryOne<{
    high_water: number; source_epoch: string;
  }>('SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 2, frontierStateSeq: state.high_water,
      sourceEpoch: state.source_epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const root = path.join(sessionRoot('group', 'receiver'), viewId);
  await fs.access(path.join(root, 'source.db'));
  await releaseConfirmedCompanionFactSession('group', 'receiver', viewId);
  await expect(fs.access(root)).rejects.toMatchObject({ code: 'ENOENT' });
});
