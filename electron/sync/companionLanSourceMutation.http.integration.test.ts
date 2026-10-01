// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { seedMixedSource } from './companionLanMultiNodeBatch.testSupport.js';
import { mutateSourceDuringFrozenRound, mutationReceiverRows,
  prepareMutationRoundPack, type MutationFacts } from './companionLanSourceMutation.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

const ids = vi.hoisted(() => ({
  source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
  receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
}));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir, app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: ids.source,
  devices: [ids.source, ids.receiver].map((device_identity_key) => ({ device_identity_key, state: 'active' }))
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group', group_key: Buffer.alloc(32, 7).toString('base64url'),
    group_tag: 'test-tag' }), consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

async function receiveMutationWindow(http: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>,
  port: ReturnType<typeof createBetterSqliteDbPort>, url: URL, cursor: number) {
    for (let page = 0; page < 20; page++) {
      const archive = await http.archive(url);
      try {
        const incoming = resolveSyncPackPath('mutation-incoming.db');
        const manifest = await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath,
          outputPath: incoming, expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
          maxDatabaseBytes: 4 * 1024 * 1024 });
        await port.run('ATTACH DATABASE ? AS inc', [incoming]);
        try {
          await assertSyncPackManifestMatchesDatabase(port, manifest);
          const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: cursor,
            sourcePeerId: ids.source, hostName: 'receiver', enqueueSearchInvalidations: false });
          if (result.dependencyProgress) {
            url = new URL(dependencyResumeUrl(url.toString(), result.dependencyProgress));
          } else {
            expect(result.applied).toBe(true);
            return result.toStateSeq;
          }
        } finally { await port.run('DETACH DATABASE inc'); }
      } finally { await archive.cleanup(); }
    }
    throw new Error('mutation_pack_incomplete');
}

it('keeps a frozen HTTP round consistent and delivers concurrent source edit and deletion in the next round', async () => {
  seedMixedSource(ids);
  const source = openDatabaseConnection().sqlite;
  for (let seq = 7; seq <= 40; seq++) source.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, updated_at, sync_dirty, last_modified_by_host_name)
    VALUES ('node', ?, ?, 'orphan', 'now', 0, 'source')`).run(`orphan-${seq}`, seq);
  source.prepare('UPDATE sync_state_sequence SET high_water=40 WHERE singleton_id=1').run();
  const target = new Database(resolveSyncPackPath('mutation-target.db'));
  initializeDatabaseConnection({ sqlite: target });
  target.prepare('ATTACH DATABASE ? AS source').run(openDatabaseConnection().dbPath);
  target.exec(`INSERT INTO sync_groups SELECT * FROM source.sync_groups;
    INSERT INTO sync_group_devices SELECT * FROM source.sync_group_devices; DETACH DATABASE source`);
  target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(ids.receiver);
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source, receiverDeviceId: ids.receiver });
  const port = createBetterSqliteDbPort(target);
  let cursor = 0;

  try {
    const first = await http.getJson('/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=0');
    mutateSourceDuringFrozenRound();
    const prepared = await prepareMutationRoundPack(http, port, 0, undefined, first as unknown as MutationFacts);
    expect(prepared.boundary.frontier).toBe(40);
    cursor = await receiveMutationWindow(http, port, prepared.url, cursor);
    expect(cursor).toBeGreaterThan(0);
    expect(cursor).toBeLessThan(prepared.boundary.frontier);
    const original = [1, 2].map((n) => ({ id: `live-${n}`, current_version_id: `version-${n}`,
      content: `body-${n}`, deleted_at: null }));
    expect(mutationReceiverRows(target)).toEqual(original);
    cursor = await receiveMutationWindow(http, port,
      (await prepareMutationRoundPack(http, port, cursor, prepared.boundary)).url, cursor);
    expect(cursor).toBe(40);
    expect(mutationReceiverRows(target)).toEqual(original);
    const next = await prepareMutationRoundPack(http, port, cursor);
    expect(next.boundary.frontier).toBe(42);
    expect(next.boundary.epoch).toBe(prepared.boundary.epoch);
    cursor = await receiveMutationWindow(http, port, next.url, cursor);
    expect(cursor).toBe(42);
    expect(mutationReceiverRows(target)).toEqual([
      { id: 'live-1', current_version_id: 'changed-41', content: 'edited-body', deleted_at: null },
      { id: 'live-2', current_version_id: 'changed-42', content: 'body-2', deleted_at: 'later' }
    ]);
    expect(target.prepare('SELECT version_id, parent_version_id FROM node_sync_version_parents ORDER BY version_id')
      .all()).toEqual([]);
    expect(target.pragma('quick_check', { simple: true })).toBe('ok');
    expect(target.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').pluck().all())
      .toEqual(['changed-41', 'changed-42']);
    await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
    await fs.writeFile('.tmp/artifacts/T267/concurrent-source-http.json', JSON.stringify({
      initialRound: prepared.boundary, nextRound: next.boundary, cursor,
      rows: mutationReceiverRows(target), quickCheck: 'ok'
    }, null, 2));
  } finally {
    await http.close();
    target.close();
    revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
  }
}, 60_000);
