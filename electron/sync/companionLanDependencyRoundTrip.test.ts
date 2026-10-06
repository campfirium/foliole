// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { loadPendingNodeVersionReceipts } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import { dependencyResumeUrl, retireSyncPackDependencyView } from '../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import type { SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { openCompanionDependencySession } from './companionLanDependencySession.js';
import { buildCompanionSyncPackResource } from './companionLanSyncPack.js';
import { loadCompanionSyncPackFactIndex } from './companionLanSyncPackFacts.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: 'source',
  devices: [{ device_identity_key: 'source', state: 'active' },
    { device_identity_key: 'receiver', state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({ ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

function seedHistory() {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  driver.execute("DELETE FROM sync_object_state WHERE object_type = 'setting'");
  const body = 'b'.repeat(741 * 1024);
  const ids = ['desktop#node-1-v1', ...Array.from({ length: 22 }, (_, i) => `v${i + 2}`)];
  driver.execute(`UPDATE node_sync_versions SET body_text = ?,
    snapshot_json = '{"id":"node-1","content":null}' WHERE version_id = ?`, [body, ids[0]!]);
  for (let i = 1; i < ids.length; i++) {
    driver.execute(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json)
      VALUES (?, 'node-1', ?, 'desktop', '2026-09-28', ?, ?, '{"id":"node-1","content":null}')`,
    [ids[i]!, ids[i - 1]!, `hash-${i}`, body]);
    driver.execute('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)', [ids[i]!, ids[i - 1]!]);
  }
  driver.execute(`UPDATE nodes SET current_version_id = 'v23', sync_dirty = 0,
    content = ?, body_blob_hash = NULL WHERE id = 'node-1'`, [body]);
  driver.execute('UPDATE sync_object_state SET sync_dirty = 0');
}

function initialRequest(factIndex?: SyncPackFactIndex, origin = 'http://localhost') {
  const url = new URL('/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0', origin);
  const index = factIndex ?? loadCompanionSyncPackFactIndex(url);
  const bits = encodeSyncPackFactClaims(index, { versions: [], parents: [], reviews: [] });
  url.searchParams.set('fact_index_id', index.index_id);
  url.searchParams.set('have_v', bits.versions);
  url.searchParams.set('have_p', bits.parents);
  url.searchParams.set('have_r', bits.reviews);
  return url;
}

async function receive(url: URL, target: Database.Database, page: number, verifyRollback = false,
  requestPack?: (url: URL) => Promise<{ status: 'ready'; filePath: string; cleanup: () => Promise<void> }>) {
  const resource = requestPack ? await requestPack(url) : await buildCompanionSyncPackResource(url, 'receiver');
  expect(resource.status).toBe('ready');
  const port = createBetterSqliteDbPort(target);
  const incomingPath = resolveSyncPackPath(`incoming-${page}.db`);
  try {
    const manifest = await extractSyncPackDatabaseFromFile({ archivePath: resource.filePath!,
      outputPath: incomingPath, expectedPeerId: 'receiver', expectedSourcePeerId: 'source',
      maxDatabaseBytes: 4 * 1024 * 1024 });
    await port.run('ATTACH DATABASE ? AS inc', [incomingPath]);
    try {
      await assertSyncPackManifestMatchesDatabase(port, manifest);
      if (verifyRollback && manifest.dependencyTransfers) await assertFinalRollback(target, port);
      return await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
        hostName: 'receiver', sourcePeerId: 'source', enqueueSearchInvalidations: false,
        recordVersionReceipt: true });
    } finally { await port.run('DETACH DATABASE inc'); }
  } finally { await resource.cleanup?.(); }
}

async function assertFinalRollback(target: Database.Database, port: ReturnType<typeof createBetterSqliteDbPort>) {
  target.exec(`CREATE TRIGGER reject_receipt BEFORE INSERT ON node_version_inbound_receipts
    BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0, hostName: 'receiver',
      sourcePeerId: 'source', enqueueSearchInvalidations: false, recordVersionReceipt: true }))
      .rejects.toThrow('injected receipt failure');
    expect(target.prepare('SELECT count(*) AS count FROM nodes').get()).toEqual({ count: 0 });
    expect(await loadPendingNodeVersionReceipts(port, 'source')).toEqual([]);
    expect(target.prepare('SELECT count(*) AS count FROM sync_pack_receive_progress').get()).toEqual({ count: 0 });
  } finally { target.exec('DROP TRIGGER reject_receipt'); }
}

function createReceiver() {
  const target = new Database(resolveSyncPackPath('receiver.db'));
  target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  target.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'receiver', 'active', 'now');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now');`);
  return target;
}

it('rebuilds a genuinely missing source snapshot without changing epoch or skipping its missing history', async () => {
  seedHistory();
  const target = createReceiver();
  try {
    const first = (await receive(initialRequest(), target, 0)).dependencyProgress!;
    expect(first.nextRow).toBeGreaterThan(0);
    const session = await openCompanionDependencySession('group', 'receiver', first.transfer.sourceViewId);
    const sourcePath = session.view.filePath;
    session.view.close();
    await fs.rename(sourcePath, `${sourcePath}.lost`);
    await expect(buildCompanionSyncPackResource(new URL(dependencyResumeUrl(initialRequest().toString(), first)), 'receiver'))
      .rejects.toThrow('sync_pack_source_view_unavailable');
    expect(target.prepare('SELECT next_row FROM sync_pack_dependency_transfers').get())
      .toEqual({ next_row: first.nextRow });
    await retireSyncPackDependencyView(createBetterSqliteDbPort(target), first.transfer);
    let url = initialRequest();
    const seenRequests = new Set<string>();
    for (;;) {
      expect(seenRequests.has(url.href)).toBe(false);
      seenRequests.add(url.href);
      const result = await receive(url, target, seenRequests.size);
      if (!result.dependencyProgress) break;
      expect(result.dependencyProgress.transfer.sourceViewId).not.toBe(first.transfer.sourceViewId);
      expect(result.sourceEpoch).toBe(first.transfer.sourceEpoch);
      expect(result.toStateSeq).toBe(0);
      url = new URL(dependencyResumeUrl(url.toString(), result.dependencyProgress));
    }
    expect(target.prepare('SELECT count(*) AS count FROM node_sync_versions').get()).toEqual({ count: 23 });
    expect(target.prepare('SELECT cursor_state_seq FROM sync_pack_receive_progress').get()).toEqual({ cursor_state_seq: 1 });
    expect(target.prepare('SELECT count(*) AS count FROM sync_pack_retired_source_views').get()).toEqual({ count: 1 });
  } finally { target.close(); }
});
