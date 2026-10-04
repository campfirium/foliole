// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { readReadySyncIdentityPage } from '../../lib/core/sync/syncIdentityIndexMaintenance.js';
import { applySyncIdentityPackWithDbPort } from '../../lib/core/sync/syncIdentityPackApply.js';
import { assertSyncIdentityPackInnerMatchesDatabase } from '../../lib/core/sync/syncIdentityPackManifest.js';
import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { openContinuationReceiver } from '../sync/desktopResourceArticleContinuation.testSupport.js';
import { extractSyncIdentityPackDatabaseFromFile,
  extractSyncPackDatabaseFromFile } from '../sync/syncPackContainerReader.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { buildSyncIdentityPackFromDriver } from './syncIdentityPackBuilder.js';
import { createSyncIdentitySourceView } from './syncIdentitySourceView.js';
import {
  insertNodeSyncState, mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle, readPackRows
} from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));

setupSyncPackBuilderTestLifecycle();

async function applyDependencyPackOnEmptyReceiver(extractedPath: string,
  verified: Awaited<ReturnType<typeof extractSyncIdentityPackDatabaseFromFile>>, targetId: string) {
  const receiverPath = resolveSyncPackPath('prelude-receiver.db');
  await openDatabaseConnection().sqlite.backup(receiverPath);
  const receiver = openContinuationReceiver(receiverPath);
  try {
    receiver.sqlite.exec(`DELETE FROM node_sync_versions; DELETE FROM nodes;
      DELETE FROM sync_object_state WHERE object_type = 'node'`);
    receiver.sqlite.prepare('UPDATE sync_group_local_state SET local_device_identity_key = ?')
      .run(targetId);
    const receiverPort = createBetterSqliteDbPort(receiver.sqlite);
    await receiverPort.run(`ATTACH DATABASE '${extractedPath}' AS inc`);
    try {
      await applySyncIdentityPackWithDbPort(receiverPort, verified, { hostName: 'receiver' });
    } finally { await receiverPort.run('DETACH DATABASE inc'); }
    expect(receiver.sqlite.prepare("SELECT parent_id FROM nodes WHERE id = 'node-1'").get())
      .toEqual({ parent_id: 'parent' });
    expect(receiver.sqlite.prepare("SELECT id FROM nodes WHERE id = 'parent'").get())
      .toEqual({ id: 'parent' });
  } finally { receiver.sqlite.close(); }
}

it('builds a bounded identity pack from a fixed source view without a cross-device sequence cursor', async () => {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', 'source', 'active', 'now')");
  driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'source', '11111111-1111-4111-8111-111111111111',
      '/source', 'Source', 'mac', 'active', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'target', '22222222-2222-4222-8222-222222222222',
      '/target', 'Target', 'mac', 'active', 'now', 'now')`);
  const view = await createSyncIdentitySourceView(openDatabaseConnection().sqlite,
    resolveSyncPackPath('source-view.db'));
  try {
    const partition = syncIdentityPartition('node', 'node-1');
    const identity = (await readReadySyncIdentityPage(view.port, partition, null)).entries
      .find((row) => row.object_id === 'node-1')!;
    const page = buildSyncIdentityPackPage({
      group_id: 'group', source_peer_id: 'source', target_peer_id: 'target',
      source_view_id: view.sourceViewId, page_index: 0, previous_page_id: null,
      objects: [identity]
    });
    const outputPath = resolveSyncPackPath('identity.zip');
    await buildSyncIdentityPackFromDriver({ page, outputPath }, view.driver);
    const pack = readPackRows(outputPath);
    expect(pack.manifest).toMatchObject({ contract: 'global-id-v1', format_version: 21,
      identity_page: { page_id: page.page_id } });
    expect(pack.manifest).not.toHaveProperty('from_state_seq');
    expect(pack.stateRows).toEqual([{ object_type: 'node', object_id: 'node-1', state_seq: 0 }]);
    expect(pack.nodeVersions).toHaveLength(1);
    expect(pack.syncObjects).toEqual([]);
    const extractedPath = resolveSyncPackPath('verified-identity.db');
    const verified = await extractSyncIdentityPackDatabaseFromFile({
      archivePath: outputPath, expectedPeerId: 'target', expectedSourcePeerId: 'source',
      outputPath: extractedPath
    });
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
    await port.run(`ATTACH DATABASE '${extractedPath}' AS inc`);
    try { await assertSyncIdentityPackInnerMatchesDatabase(port, verified); }
    finally { await port.run('DETACH DATABASE inc'); }
    await expect(extractSyncPackDatabaseFromFile({ archivePath: outputPath,
      expectedPeerId: 'target', expectedSourcePeerId: 'source',
      outputPath: resolveSyncPackPath('legacy.db') })).rejects.toThrow('invalid_sync_pack_manifest');
  } finally { view.close(); }
});

it('records structural parent state as a verified dependency outside the candidate page', async () => {
  insertNodeSyncState();
  const sourceId = JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']);
  const targetId = JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/target']);
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('parent', 'topic', 'Parent', '', '2026-04-27', '2026-04-27')`);
  driver.execute(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
    content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node', 'parent', 3, 'parent-hash', 'desktop', '2026-04-27')`);
  flushNodeSyncVersionWithDriver(driver, 'parent', 'desktop');
  driver.execute("UPDATE nodes SET parent_id = 'parent' WHERE id = 'node-1'");
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')", [sourceId]);
  driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, '11111111-1111-4111-8111-111111111111',
      '/source', 'Source', 'mac', 'active', 'now', 'now')`, [sourceId]);
  driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, '22222222-2222-4222-8222-222222222222',
      '/target', 'Target', 'mac', 'active', 'now', 'now')`, [targetId]);
  const view = await createSyncIdentitySourceView(openDatabaseConnection().sqlite,
    resolveSyncPackPath('prelude-view.db'));
  try {
    const partition = syncIdentityPartition('node', 'node-1');
    const identity = (await readReadySyncIdentityPage(view.port, partition, null)).entries
      .find((row) => row.object_id === 'node-1')!;
    const page = buildSyncIdentityPackPage({
      group_id: 'group', source_peer_id: sourceId, target_peer_id: targetId,
      source_view_id: view.sourceViewId, page_index: 0, previous_page_id: null,
      objects: [identity]
    });
    const outputPath = resolveSyncPackPath('prelude-identity.zip');
    await buildSyncIdentityPackFromDriver({ page, outputPath }, view.driver);
    const pack = readPackRows(outputPath);
    expect(pack.nodes.map((node) => (node as { id: string }).id))
      .toEqual(expect.arrayContaining(['parent', 'node-1']));
    expect(pack.stateRows).toEqual([
      { object_type: 'node', object_id: 'node-1', state_seq: 0 },
      { object_type: 'node', object_id: 'parent', state_seq: 0 }
    ]);
    expect(pack.manifest.dependencies).toEqual([expect.objectContaining({
      object_type: 'node', object_id: 'parent'
    })]);
    const extractedPath = resolveSyncPackPath('prelude-verified.db');
    const verified = await extractSyncIdentityPackDatabaseFromFile({
      archivePath: outputPath, expectedPeerId: targetId, expectedSourcePeerId: sourceId,
      outputPath: extractedPath
    });
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
    await port.run(`ATTACH DATABASE '${extractedPath}' AS inc`);
    try { await assertSyncIdentityPackInnerMatchesDatabase(port, verified); }
    finally { await port.run('DETACH DATABASE inc'); }
    await applyDependencyPackOnEmptyReceiver(extractedPath, verified, targetId);
  } finally { view.close(); }
});
