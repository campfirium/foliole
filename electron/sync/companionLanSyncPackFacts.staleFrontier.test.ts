// @vitest-environment node
import type http from 'node:http';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle
} from '../database/syncPackBuilderTestSupport.js';

import { handleCompanionSyncPackFactsGet } from './companionLanSyncPackFacts.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
setupSyncPackBuilderTestLifecycle();

it('asks the receiver to restart when a fixed frontier lost an earlier object state', async () => {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  const state = driver.queryOne<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  driver.execute("UPDATE sync_object_state SET state_seq = 4 WHERE object_type = 'node' AND object_id = 'node-1'");
  driver.execute('UPDATE sync_state_sequence SET high_water = 4 WHERE singleton_id = 1');
  const url = new URL('http://localhost/companion/sync-pack-facts?after_state_seq=0&page_contract=bounded-v1');
  url.searchParams.set('frontier_state_seq', '1');
  url.searchParams.set('source_epoch', state.source_epoch);
  const writeJson = vi.fn();
  expect(await handleCompanionSyncPackFactsGet({} as http.IncomingMessage,
    {} as http.ServerResponse, url, 'receiver', writeJson)).toBe(true);
  expect(writeJson).toHaveBeenCalledWith({}, {}, 409,
    { error: 'sync_pack_source_view_unavailable' });
});
