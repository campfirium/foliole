// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../../../../../../electron/database/connection.js';
import { buildSyncIdentityPackFromDriver } from '../../../../../../electron/database/syncIdentityPackBuilder.js';
import { createSyncIdentitySourceView } from '../../../../../../electron/database/syncIdentitySourceView.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../../../../../../electron/database/syncPackBuilderTestSupport.js';
import { extractSyncIdentityPackDatabaseFromFile } from '../../../../../../electron/sync/syncPackContainerReader.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { verifySyncIdentityFactProof } from '../../../../../../lib/core/sync/syncIdentityFactProofSeal.js';
import { readReadySyncIdentityGlobalPage, readReadySyncIdentityInventory } from '../../../../../../lib/core/sync/syncIdentityGlobalRead.js';
import { readSyncIdentityNodeFactDataRoot } from '../../../../../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { buildSyncIdentityPackPage } from '../../../../../../lib/core/sync/syncIdentityPackPage.js';
import { buildSyncIdentityRestoreSet } from '../../../../../../lib/core/sync/syncIdentityRestoreSet.js';
import { initializeCompanionIdentityCandidates,
  stageCompanionIdentityCandidates } from '../syncGroupIdentityCandidateStore.js';
import { stageCompanionSyncIdentityRestore } from '../syncGroupIdentityRestoreStage.js';

import { applyCompanionSyncIdentityRestore } from './companionSyncIdentityRestoreApply.js';

const runtime = vi.hoisted(() => ({ port: null as unknown as DbPort,
  download: vi.fn() }));
const ids = {
  source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
  target: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/target'])
};
vi.mock('../../../companionRuntimeCapabilities', () => ({
  requireAvailableCompanionRuntime: () => ({ kind: 'ios-native' }),
  NativeCompanionCapabilityUnavailableError: class extends Error {}
}));
vi.mock('../../../companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: (task: () => Promise<unknown>) => task()
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (port: DbPort) => Promise<unknown>) => task(runtime.port),
    runWriter: (task: (port: DbPort) => Promise<unknown>) => task(runtime.port)
  })
}));
vi.mock('./companionSyncIdentityDownload', () => ({
  downloadCompanionSyncIdentityPage: runtime.download
}));
vi.mock('../../../../../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));

setupSyncPackBuilderTestLifecycle();

function seedSource() {
  insertNodeSyncState();
  const db = openDatabaseConnection().driver;
  db.execute(`UPDATE sync_object_state SET current_version_id = 'desktop#node-1-v1'
    WHERE object_type = 'node' AND object_id = 'node-1'`);
  db.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  db.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')", [ids.source]);
  for (const name of ['source', 'target'] as const) db.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, ?, 'mac', 'active', 'now', 'now')`,
  [ids[name], name === 'source' ? '11111111-1111-4111-8111-111111111111' :
    '22222222-2222-4222-8222-222222222222', `/${name}`, name]);
}

async function prepareTarget(source: Database.Database, targetPath: string,
  snapshotPath: string) {
  await source.backup(targetPath);
  const target = new Database(targetPath);
  target.prepare('UPDATE sync_group_local_state SET local_device_identity_key = ?').run(ids.target);
  target.prepare(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES ('restore', 'group', '2026-10-04T00:00:00.000Z', ?, NULL,
      '2026-10-04T00:00:00.000Z')`).run(ids.source);
  target.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('target-only', 'topic', 'Only target', '', 'now', 'now');`);
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  new Database(snapshotPath).close();
  runtime.port = createBetterSqliteDbPort(target);
  return target;
}

async function buildRestorePacks(view: Awaited<ReturnType<typeof createSyncIdentitySourceView>>,
  setId: string, entries: Array<{ object_type: string; object_id: string; fingerprint: string }>) {
  const packs = [];
  let previousPageId: string | null = null;
  for (const [index, entry] of entries.entries()) {
    const page = buildSyncIdentityPackPage({ group_id: 'group',
      source_peer_id: ids.source, target_peer_id: ids.target,
      source_view_id: view.sourceViewId, page_index: index,
      previous_page_id: previousPageId, objects: [entry],
      restore_id: 'restore', restore_set_id: setId });
    const archivePath = resolveSyncPackPath(`mobile-restore-${index}.zip`);
    const packPath = resolveSyncPackPath(`mobile-restore-${index}.db`);
    await buildSyncIdentityPackFromDriver({ page, outputPath: archivePath }, view.driver);
    const manifest = await extractSyncIdentityPackDatabaseFromFile({ archivePath,
      expectedPeerId: ids.target, expectedSourcePeerId: ids.source, outputPath: packPath });
    packs.push({ page, manifest, packPath });
    previousPageId = page.page_id;
  }
  return packs;
}

async function assertFailedFinalPagePreservesTarget(target: Database.Database,
  snapshotPath: string, staged: Awaited<ReturnType<typeof stageCompanionSyncIdentityRestore>>) {
  const pages = staged.pages.map((item, index) => index === 1 ?
    { ...item, manifest: { ...item.manifest, pack_id: '0'.repeat(64) } } : item);
  await expect(applyCompanionSyncIdentityRestore({ hostName: 'Phone', snapshotPath,
    staged: { ...staged, pages } })).rejects.toThrow(/sync_identity_pack_/u);
  expect(target.prepare("SELECT id FROM nodes WHERE id = 'target-only'").get())
    .toEqual({ id: 'target-only' });
  expect(target.prepare("SELECT applied_at FROM sync_group_restore_events WHERE restore_id = 'restore'").get())
    .toEqual({ applied_at: null });
}

it('replays a native staged restore in one writer transaction', async () => {
  seedSource();
  const source = openDatabaseConnection().sqlite;
  const view = await createSyncIdentitySourceView(source, resolveSyncPackPath('mobile-source.db'));
  const targetPath = resolveSyncPackPath('mobile-target.db');
  const snapshotPath = path.join(mockedSyncPackBuilderAppDataDir, 'cache',
    'foliole-provider-source-mobile-test.db').split(path.sep).join('/');
  let target: Database.Database | undefined;
  try {
    const inventory = await readReadySyncIdentityInventory(view.port);
    const entries = (await readReadySyncIdentityGlobalPage(view.port, null)).entries;
    const set = buildSyncIdentityRestoreSet({ restore_id: 'restore', group_id: 'group',
      source_peer_id: ids.source, target_peer_id: ids.target,
      source_view_id: view.sourceViewId, source_epoch: view.sourceEpoch,
      fact_proof_root: await verifySyncIdentityFactProof(view.port),
      fact_data_root: await readSyncIdentityNodeFactDataRoot(view.port), inventory });
    const packs = await buildRestorePacks(view, set.set_id, entries);
    target = await prepareTarget(source, targetPath, snapshotPath);
    await initializeCompanionIdentityCandidates(snapshotPath);
    await stageCompanionIdentityCandidates(snapshotPath, entries.map((entry) => ({
      ...entry, partition: -1,
      kind: 'source_only' as const, source_fingerprint: entry.fingerprint,
      receiver_fingerprint: null
    })));
    runtime.download.mockImplementation(async ({ page: requested }: { page: typeof packs[number]['page'] }) => {
      const pack = packs[requested.page_index]!;
      expect(requested.page_id).toBe(pack.page.page_id);
      return { ...pack, page: requested, cleanup: async () => {} };
    });
    const staged = await stageCompanionSyncIdentityRestore({ endpointUrl: 'http://source',
      probe: { set, snapshotPath, count: entries.length,
        cleanup: async () => ({ deleted: true }) }, limit: 1 });
    expect(staged.pages).toHaveLength(entries.length);
    await assertFailedFinalPagePreservesTarget(target, snapshotPath, staged);
    const applied = await applyCompanionSyncIdentityRestore({ hostName: 'Phone',
      snapshotPath, staged });
    await staged.cleanup();
    expect(applied.applied).toBe(true);
    expect(target.prepare("SELECT id FROM nodes WHERE id = 'target-only'").get()).toBeUndefined();
    expect(target.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get())
      .toEqual({ id: 'node-1' });
    expect(target.prepare("SELECT applied_at FROM sync_group_restore_events WHERE restore_id = 'restore'").get())
      .toMatchObject({ applied_at: expect.any(String) });
  } finally {
    target?.close();
    view.close();
    await fs.rm(snapshotPath, { force: true });
  }
});
