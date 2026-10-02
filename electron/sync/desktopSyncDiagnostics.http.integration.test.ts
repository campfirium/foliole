// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { loadPendingNodeVersionReceipts } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { assertReceivedNodes, negotiateFactView, seedMixedSource } from './companionLanMultiNodeBatch.testSupport.js';
import { loadDesktopSyncActivity } from './desktopSyncActivityStore.js';
import { markDesktopSyncGroupMemberStateReady, revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

const ids = vi.hoisted(() => ({
  source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
  receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
}));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir, app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: ids.source,
  devices: [ids.source, ids.receiver].map((device_identity_key) => ({
    device_identity_key, device_name: 'Device at exchange time', state: 'active'
  }))
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group', group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

async function receivePages(server: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>, target: Database.Database) {
  const { viewId } = await negotiateFactView(server);
  let url = new URL(`/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0&fact_view=${viewId}`, server.origin);
  const port = createBetterSqliteDbPort(target);
  for (let page = 0; page < 20; page++) {
    const archive = await server.archive(url);
    try {
      const incoming = resolveSyncPackPath(`activity-incoming-${page}.db`);
      await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath, outputPath: incoming,
        expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source, maxDatabaseBytes: 4 * 1024 * 1024 });
      await port.run('ATTACH DATABASE ? AS inc', [incoming]);
      try {
        const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0, hostName: 'receiver',
          sourcePeerId: ids.source, recordVersionReceipt: true, enqueueSearchInvalidations: false });
        if (!result.dependencyProgress) return;
        url = new URL(dependencyResumeUrl(url.toString(), result.dependencyProgress));
      } finally { await port.run('DETACH DATABASE inc'); }
    } finally { await archive.cleanup(); }
  }
  throw new Error('activity_receive_incomplete');
}

async function pushReviewBack(server: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>, target: Database.Database) {
  await expect(server.postJson('/companion/sync-push', { invalid: true })).rejects.toThrow('invalid_sync_push_payload');
  expect(loadDesktopSyncActivity()[0]).toMatchObject({ direction: 'receive', status: 'failed', stage: 'sync_push' });
  const review = { host_name: 'Device', id: 'review-from-receiver', node_id: 'live-1', op_id: 'receiver-op',
    reviewed_at: '2026-10-02T00:00:00Z', grade: 3, scheduler_version: 'ts-fsrs@4',
    difficulty_before: 2, difficulty_after: 3, stability_before: 3, stability_after: 4,
    due_before: '2026-10-02T00:00:00Z', due_after: '2026-10-03T00:00:00Z' };
  target.prepare(`INSERT INTO review_log (${Object.keys(review).join(',')})
    VALUES (${Object.keys(review).map(() => '?').join(',')})`).run(...Object.values(review));
  const stored = target.prepare('SELECT * FROM review_log WHERE op_id=?').get('receiver-op');
  const ack = await server.postJson('/companion/sync-push', { items: [{
    authorHostName: 'Device', base: { kind: 'op_id', opId: 'receiver-op' }, clientOpId: 'review_log:receiver-op',
    identity: { objectId: 'receiver-op', objectType: 'review_log', scope: 'workspace' }, payloadJson: JSON.stringify(stored)
  }] });
  expect(ack).toMatchObject({ acks: [{ status: 'accepted' }] });
  expect(openDatabaseConnection().sqlite.prepare('SELECT * FROM review_log WHERE op_id=?').get('receiver-op')).toEqual(stored);
  expect(loadDesktopSyncActivity()[0]).toMatchObject({ direction: 'receive', stage: 'sync_push',
    peer_device_id: ids.receiver, confirmation: 'saved', record_count: 1, result: 'completed' });
}

it('records sending separately from actual saving confirmation through authenticated HTTP and independent databases', async () => {
  seedMixedSource(ids);
  const target = new Database(resolveSyncPackPath('activity-receiver.db'));
  target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  target.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(ids.receiver);
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source, receiverDeviceId: ids.receiver });
  try {
    await receivePages(server, target);
    assertReceivedNodes(target, false);
    const sent = loadDesktopSyncActivity().filter((event) => event.confirmation === 'sent');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((event) => event.result === 'waiting' && event.direction === 'send')).toBe(true);
    expect(loadDesktopSyncActivity().some((event) => event.confirmation === 'confirmed')).toBe(false);
    const receipts = await loadPendingNodeVersionReceipts(createBetterSqliteDbPort(target), ids.source);
    expect(receipts.length).toBeGreaterThan(0);
    for (const receipt of receipts) expect(await server.postJson('/companion/version-pack-receipt', receipt))
      .toEqual({ accepted: true });
    const confirmed = loadDesktopSyncActivity().filter((event) => event.confirmation === 'confirmed');
    expect(confirmed.some((event) => (event.record_count ?? 0) > 0)).toBe(true);
    expect(confirmed.every((event) => sent.some((before) => before.run_id === event.run_id))).toBe(true);
    await pushReviewBack(server, target);
    const beforeReopen = loadDesktopSyncActivity();
    closeDatabaseConnection();
    expect(loadDesktopSyncActivity()).toEqual(beforeReopen);
    expect(target.pragma('quick_check', { simple: true })).toBe('ok');
  } finally {
    await server.close(); target.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
  }
}, 60_000);
