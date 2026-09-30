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
import { prepareMutationRoundPack } from './companionLanSourceMutation.testSupport.js';
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

function addReview(index: number) {
  openDatabaseConnection().driver.execute(`INSERT INTO review_log
    (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
      due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after)
    VALUES (?, ?, 'source', 'live-1', 3, 'ts-fsrs@4', ?, 'before', 1, 2, 'after', 3, 4)`,
  [`log-${index}`, `op-${index}`, `2026-09-30T00:0${index}:00Z`]);
}

function seedReviewSource() {
  seedMixedSource(ids);
  const source = openDatabaseConnection().driver;
  source.execute(`INSERT INTO node_review
    (node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses)
    VALUES ('live-1', 'after', '2026-09-30T00:04:00Z', 2, 3, 4, 1, 1, 5, 0)`);
  for (let index = 0; index < 5; index++) addReview(index);
  source.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node_review', 'live-1', 7, 'review-five', 'source', '2026-09-30T00:04:00Z', 0)`);
  source.execute('UPDATE sync_state_sequence SET high_water=7 WHERE singleton_id=1');
}

function createReviewReceiver() {
  const target = new Database(resolveSyncPackPath('review-delta-target.db'));
  initializeDatabaseConnection({ sqlite: target });
  target.prepare('ATTACH DATABASE ? AS source').run(openDatabaseConnection().dbPath);
  target.exec(`INSERT INTO sync_groups SELECT * FROM source.sync_groups;
    INSERT INTO sync_group_devices SELECT * FROM source.sync_group_devices; DETACH DATABASE source`);
  target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(ids.receiver);
  return target;
}

async function receiveReviews(http: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>,
  target: Database.Database, after: number, currentCursor = after) {
  const port = createBetterSqliteDbPort(target);
  let url = (await prepareMutationRoundPack(http, port, after)).url;
  const sent: string[] = [];
  const sentVersions: string[] = [];
  for (let page = 0; page < 30; page++) {
    const archive = await http.archive(url);
    try {
      const incoming = resolveSyncPackPath('review-delta-incoming.db');
      const manifest = await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath,
        outputPath: incoming, expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
        maxDatabaseBytes: 4 * 1024 * 1024 });
      await port.run('ATTACH DATABASE ? AS inc', [incoming]);
      try {
        await assertSyncPackManifestMatchesDatabase(port, manifest);
        sent.push(...target.prepare('SELECT op_id FROM inc.review_log').pluck().all() as string[]);
        sentVersions.push(...target.prepare('SELECT version_id FROM inc.node_sync_versions').pluck().all() as string[]);
        const staged = manifest.dependencyPage ? target.prepare('SELECT row_json FROM inc.sync_pack_dependency_page_rows')
          .pluck().all() as string[] : [];
        for (const serialized of staged) {
          const row = JSON.parse(serialized);
          const payload = JSON.parse(row.json);
          if (row.table === 'review_log') sent.push(payload.op_id);
          if (row.table === 'node_sync_versions') sentVersions.push(payload.version_id);
        }
        const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor,
          sourcePeerId: ids.source, hostName: 'receiver', enqueueSearchInvalidations: false });
        if (!result.dependencyProgress) return { result, sent, sentVersions };
        url = new URL(dependencyResumeUrl(url.toString(), result.dependencyProgress));
      } finally { await port.run('DETACH DATABASE inc'); }
    } finally { await archive.cleanup(); }
  }
  throw new Error('review_delta_incomplete');
}

function reviewState(target: Database.Database) {
  return { logs: target.prepare('SELECT * FROM review_log ORDER BY op_id').all(),
    review: target.prepare('SELECT * FROM node_review ORDER BY node_id').all(),
    states: target.prepare('SELECT * FROM sync_object_state ORDER BY object_type, object_id').all(),
    sequence: target.prepare('SELECT high_water FROM sync_state_sequence').pluck().get() };
}

it('sends only a new review operation over authenticated HTTP and replay leaves durable business state unchanged', async () => {
  seedReviewSource();
  const target = createReviewReceiver();
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source, receiverDeviceId: ids.receiver });
  try {
    const initial = await receiveReviews(http, target, 0);
    expect(initial.result).toMatchObject({ applied: true, toStateSeq: 7 });
    expect(target.prepare('SELECT op_id FROM review_log ORDER BY op_id').pluck().all())
      .toEqual(['op-0', 'op-1', 'op-2', 'op-3', 'op-4']);
    addReview(5);
    const source = openDatabaseConnection().driver;
    source.execute("UPDATE node_review SET reps=6, last_review_at='2026-09-30T00:05:00Z' WHERE node_id='live-1'");
    source.execute(`UPDATE sync_object_state SET state_seq=8, content_hash='review-six',
      updated_at='2026-09-30T00:05:00Z' WHERE object_type='node_review' AND object_id='live-1'`);
    source.execute('UPDATE sync_state_sequence SET high_water=8 WHERE singleton_id=1');
    const delta = await receiveReviews(http, target, 7);
    expect(delta.result).toMatchObject({ applied: true, toStateSeq: 8 });
    expect(delta.sent).toEqual(['op-5']);
    expect(delta.sentVersions).toEqual([]);
    expect(target.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(6);
    const beforeReplay = reviewState(target);
    const replay = await receiveReviews(http, target, 7, 8);
    expect(replay.result.applied).toBe(false);
    expect(replay.sent).toEqual([]);
    expect(replay.sentVersions).toEqual([]);
    expect(reviewState(target)).toEqual(beforeReplay);
    expect(target.pragma('quick_check', { simple: true })).toBe('ok');
    await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
    await fs.writeFile('.tmp/artifacts/T267/authenticated-review-delta.json', JSON.stringify({
      initial: initial.result, delta: delta.result, sent: delta.sent, sentVersions: delta.sentVersions,
      replay: replay.result, replaySent: replay.sent, businessSequence: beforeReplay.sequence
    }, null, 2));
  } finally {
    await http.close();
    target.close();
    revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
  }
}, 60_000);
