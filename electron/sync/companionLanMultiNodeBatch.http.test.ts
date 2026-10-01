// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { assertReceivedNodes, negotiateFactView, seedMixedSource } from './companionLanMultiNodeBatch.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

const ids = vi.hoisted(() => ({
  source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
  receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
}));

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: ids.source,
  devices: [{ device_identity_key: ids.source, state: 'active' },
    { device_identity_key: ids.receiver, state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

type TestServer = Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>;

async function applyPages(server: TestServer, { viewId, frontierStateSeq }: Awaited<ReturnType<typeof negotiateFactView>>,
  softDeleted = false) {
  const targetPath = resolveSyncPackPath('multi-node-http-target.db');
  let target = new Database(targetPath);
  try {
    target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    target.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
    target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
      .run(ids.receiver);
    let url = new URL(`/companion/sync-pack?page_contract=bounded-v1` +
      `&after_state_seq=0&fact_view=${viewId}`, server.origin);
    const staged: string[] = [];
    for (let turn = 0; turn < 8; turn++) {
      const archive = await server.archive(url);
      try {
        const incoming = resolveSyncPackPath(`multi-node-http-${turn}.db`);
        await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath,
          outputPath: incoming, expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
          maxDatabaseBytes: 4 * 1024 * 1024 });
        const port = createBetterSqliteDbPort(target);
        let reopen = false;
        await port.run('ATTACH DATABASE ? AS inc', [incoming]);
        try {
          const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
            hostName: 'receiver', sourcePeerId: ids.source, recordVersionReceipt: true,
            enqueueSearchInvalidations: false });
          if (!result.dependencyProgress) {
            expect(result.toStateSeq).toBe(frontierStateSeq);
            assertReceivedNodes(target, softDeleted);
            expect(staged).toEqual(['live-1', 'live-2']);
            break;
          }
          staged.push(result.dependencyProgress.transfer.objectId);
          expect(result.toStateSeq).toBe(0);
          if (turn === 0) {
            const replay = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
              hostName: 'receiver', sourcePeerId: ids.source, recordVersionReceipt: true,
              enqueueSearchInvalidations: false });
            expect(replay.dependencyProgress).toMatchObject({
              transfer: result.dependencyProgress.transfer,
              nextRow: result.dependencyProgress.nextRow, replay: true
            });
            expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get())
              .toEqual({ count: 1 });
          }
          url = new URL(dependencyResumeUrl(url.href, result.dependencyProgress));
          reopen = turn === 0;
        } finally { await port.run('DETACH DATABASE inc'); }
        if (reopen) { target.close(); target = new Database(targetPath); }
      } finally { await archive.cleanup(); }
    }
  } finally { target.close(); }
}

it('transfers live nodes and a bare tombstone through authenticated dependency pages', async () => {
  seedMixedSource(ids);
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try { await applyPages(server, await negotiateFactView(server)); }
  finally { await server.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver); }
});

it('transfers a removed node with retained version history in the same window', async () => {
  seedMixedSource(ids, true);
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try { await applyPages(server, await negotiateFactView(server), true); }
  finally { await server.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver); }
});
