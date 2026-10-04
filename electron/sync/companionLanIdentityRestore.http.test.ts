// @vitest-environment node
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { verifySyncIdentityFactProof } from '../../lib/core/sync/syncIdentityFactProofSeal.js';
import { readSyncIdentityNodeFactDataRoot } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { parseSyncIdentityRestoreSet } from '../../lib/core/sync/syncIdentityRestoreSet.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { createSyncIdentitySourceView } from '../database/syncIdentitySourceView.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { applyDesktopSyncIdentityRestore } from './desktopSyncIdentityRestoreApply.js';
import { probeDesktopSyncIdentityRestoreSet } from './desktopSyncIdentityRestoreProbe.js';
import { stageDesktopSyncIdentityRestore } from './desktopSyncIdentityRestoreStage.js';
import { extractSyncIdentityPackDatabaseFromFile } from './syncPackContainerReader.js';

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
  devices: [ids.source, ids.receiver].map((device_identity_key) => ({ device_identity_key, state: 'active' }))
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

function seedGroup() {
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')", [ids.source]);
  for (const [id, anchor, library] of [
    [ids.source, '11111111-1111-4111-8111-111111111111', '/source'],
    [ids.receiver, '22222222-2222-4222-8222-222222222222', '/receiver']
  ] as const) driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, 'Device', 'mac', 'active', 'now', 'now')`, [id, anchor, library]);
}

async function assertFailedRestoreRollsBack(
  staged: Awaited<ReturnType<typeof stageDesktopSyncIdentityRestore>>,
  peer: { endpoint_url: string; group_id: string; local_device_id: string;
    peer_device_id: string }) {
  const pages = staged.pages.map((page, index) => index === 1 ?
    { ...page, manifest: { ...page.manifest, pack_id: '0'.repeat(64) } } : page);
  await expect(applyDesktopSyncIdentityRestore({ staged: { ...staged, pages }, peer }))
    .rejects.toThrow(/sync_identity_pack_/u);
  const state = await runWithDatabaseConnectionOwner(() => {
    const driver = openDatabaseConnection().driver;
    return { hash: driver.queryOne<{ content_hash: string }>(`
      SELECT content_hash FROM sync_object_state
      WHERE object_type = 'node' AND object_id = 'node-1'`)?.content_hash,
    applied: driver.queryOne<{ applied_at: string | null }>(`
      SELECT applied_at FROM sync_group_restore_events
      WHERE restore_id = 'restore-1'`)?.applied_at };
  });
  expect(state).toEqual({ hash: 'changed-after-restore-view', applied: null });
}

async function assertRestoreCanStage(http: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>,
  expectedSetId: string, apply = false) {
  const probe = await probeDesktopSyncIdentityRestoreSet({ endpointUrl: http.origin,
    groupId: 'group', localDeviceId: ids.receiver, peerDeviceId: ids.source,
    outputRoot: path.join(mockedSyncPackBuilderAppDataDir, 'restore-probe'),
    restoreId: 'restore-1', secret: Buffer.alloc(32, 7).toString('base64url') });
  try {
    const staged = await stageDesktopSyncIdentityRestore({ probe, limit: 1, peer: {
      endpoint_url: http.origin, group_id: 'group', local_device_id: ids.receiver,
      peer_device_id: ids.source
    } });
    try {
      expect(staged.pages).toHaveLength(staged.set.object_count);
      expect(staged.set.set_id).toBe(expectedSetId);
      expect(await runWithDatabaseConnectionOwner(() =>
        openDatabaseConnection().driver.queryOne<{ count: number }>(
          'SELECT COUNT(*) AS count FROM sync_object_state')?.count)).toBeGreaterThan(0);
      if (apply) {
        const peer = { endpoint_url: http.origin, group_id: 'group',
          local_device_id: ids.receiver, peer_device_id: ids.source };
        await runWithDatabaseConnectionOwner(() => {
          const driver = openDatabaseConnection().driver;
          driver.execute('UPDATE sync_group_local_state SET local_device_identity_key = ?',
            [ids.receiver]);
          driver.execute("UPDATE sync_group_restore_events SET applied_at = NULL WHERE restore_id = 'restore-1'");
        });
        await assertFailedRestoreRollsBack(staged, peer);
        const result = await applyDesktopSyncIdentityRestore({ staged, peer });
        expect(result.applied).toBe(true);
        expect(await runWithDatabaseConnectionOwner(() =>
          openDatabaseConnection().driver.queryOne<{ content_hash: string }>(`
            SELECT content_hash FROM sync_object_state
            WHERE object_type = 'node' AND object_id = 'node-1'`)?.content_hash)).toBe('node-hash');
        expect(await runWithDatabaseConnectionOwner(() =>
          openDatabaseConnection().driver.queryOne<{ version_id: string }>(`
            SELECT version_id FROM node_sync_versions
            WHERE version_id = 'desktop#node-1-v0'`)?.version_id)).toBe('desktop#node-1-v0');
        const view = await runWithDatabaseConnectionOwner(() =>
          createSyncIdentitySourceView(openDatabaseConnection().sqlite,
            resolveSyncPackPath('restored-proof.db')));
        try {
          expect(await readSyncIdentityNodeFactDataRoot(view.port)).toBe(staged.set.fact_data_root);
          expect(await verifySyncIdentityFactProof(view.port)).toBe(staged.set.fact_proof_root);
        }
        finally { view.close(); }
      }
    } finally { await staged.cleanup(); }
  } finally { await probe.cleanup(); }
}

function seedSourceHeldOldVersion() {
  const driver = openDatabaseConnection().driver;
  driver.execute(`UPDATE sync_object_state SET current_version_id = 'desktop#node-1-v1'
    WHERE object_type = 'node' AND object_id = 'node-1'`);
  driver.execute(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
      content_hash, snapshot_json)
    VALUES ('desktop#node-1-v0', 'node-1', NULL, 'desktop',
      '2026-04-26T00:00:00.000Z', 'old-hash',
      '{"id":"node-1","title":"Old","content":"Old body"}')`);
  driver.execute(`INSERT INTO node_version_local_holds
    (hold_id, object_id, version_id, created_at)
    VALUES ('source-only-hold', 'node-1', 'desktop#node-1-v0', 'now')`);
}

it('serves a restore-scoped full collection only for the selected source event', async () => {
  insertNodeSyncState();
  seedSourceHeldOldVersion();
  seedGroup();
  openDatabaseConnection().driver.execute(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES ('restore-1', 'group', '2026-10-04T00:00:00.000Z', ?,
      '2026-10-04T00:00:00.000Z', '2026-10-04T00:00:00.000Z')`, [ids.source]);
  markDesktopSyncGroupMemberStateReady(ids.receiver, 'restore');
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try {
    const set = parseSyncIdentityRestoreSet(await http.getJson(
      '/companion/sync-identity-restore-set?restore_id=restore-1'));
    expect(set).toMatchObject({ restore_id: 'restore-1', source_peer_id: ids.source,
      target_peer_id: ids.receiver, fact_proof_root: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(set.object_count).toBeGreaterThan(0);
    const partition = syncIdentityPartition('node', 'node-1');
    const pagePath = '/companion/sync-identity-page?' + new URLSearchParams({
      restore_id: 'restore-1', source_view_id: set.source_view_id,
      partition: String(partition) });
    expect((await http.getJson(pagePath)).entries)
      .toEqual(expect.arrayContaining([expect.objectContaining({ object_id: 'node-1' })]));
    const node = ((await http.getJson(pagePath)).entries as Array<{
      object_id: string; object_type: string; fingerprint: string }>).find(
      (row) => row.object_id === 'node-1')!;
    const restorePage = buildSyncIdentityPackPage({ group_id: 'group',
      source_peer_id: ids.source, target_peer_id: ids.receiver,
      source_view_id: set.source_view_id, page_index: 0, previous_page_id: null,
      restore_id: 'restore-1', restore_set_id: set.set_id, objects: [node] });
    const archive = await http.postArchive('/companion/sync-identity-pack?restore_id=restore-1',
      restorePage);
    try {
      const verified = await extractSyncIdentityPackDatabaseFromFile({
        archivePath: archive.filePath, outputPath: resolveSyncPackPath('restore-identity.db'),
        expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source });
      expect(verified.identity_page.restore_set_id).toBe(set.set_id);
    } finally { await archive.cleanup(); }
    await expect(http.postArchive('/companion/sync-identity-pack?restore_id=restore-1',
      buildSyncIdentityPackPage({ ...restorePage, restore_set_id: '0'.repeat(64) })))
      .rejects.toThrow('sync_http_409');
    await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.execute(`
      UPDATE sync_object_state SET content_hash = 'changed-after-restore-view'
      WHERE object_type = 'node' AND object_id = 'node-1'`));
    await assertRestoreCanStage(http, set.set_id);
    await expect(http.getJson(pagePath.replace('restore_id=restore-1&', '')))
      .rejects.toThrow('sync_http_409');
    await expect(http.getJson('/companion/sync-identity-restore-set?restore_id=other'))
      .rejects.toThrow('sync_http_409');
    await assertRestoreCanStage(http, set.set_id, true);
  } finally {
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
  }
});
