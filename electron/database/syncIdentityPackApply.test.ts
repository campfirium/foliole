// @vitest-environment node

import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { readReadySyncIdentityPage } from '../../lib/core/sync/syncIdentityIndexMaintenance.js';
import { applySyncIdentityPackWithDbPort } from '../../lib/core/sync/syncIdentityPackApply.js';
import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { extractSyncIdentityPackDatabaseFromFile } from '../sync/syncPackContainerReader.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { buildSyncIdentityPackFromDriver } from './syncIdentityPackBuilder.js';
import { createSyncIdentitySourceView } from './syncIdentitySourceView.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));

setupSyncPackBuilderTestLifecycle();

function installGroup(source: ReturnType<typeof openDatabaseConnection>) {
  const sourceId = createSyncGroupDeviceIdentity({ group_id: 'group',
    device_anchor: '11111111-1111-4111-8111-111111111111',
    library_path: '/source', path_flavor: 'posix' });
  const targetId = createSyncGroupDeviceIdentity({ group_id: 'group',
    device_anchor: '22222222-2222-4222-8222-222222222222',
    library_path: '/target', path_flavor: 'posix' });
  source.driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  source.driver.execute('INSERT INTO sync_group_local_state VALUES (1, ?, ?, ?, ?)',
    ['group', sourceId.identity_key, 'active', 'now']);
  for (const [device, name] of [[sourceId, 'Source'], [targetId, 'Target']] as const) {
    source.driver.execute(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path,
       device_name, platform, state, joined_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'mac', 'active', 'now', 'now')`,
      ['group', device.identity_key, device.device_anchor, device.canonical_library_path, name]);
  }
  return { sourceId, targetId };
}

it('applies a verified identity pack once and commits its receipt with the node', async () => {
  insertNodeSyncState();
  const source = openDatabaseConnection();
  const { sourceId, targetId } = installGroup(source);
  const receiverPath = resolveSyncPackPath('receiver.db');
  await source.sqlite.backup(receiverPath);
  const receiver = new Database(receiverPath);
  receiver.exec(`DELETE FROM node_sync_versions; DELETE FROM nodes;
    DELETE FROM sync_object_state WHERE object_type = 'node'`);
  receiver.prepare(`UPDATE sync_group_local_state SET local_device_identity_key = ?`)
    .run(targetId.identity_key);
  const view = await createSyncIdentitySourceView(source.sqlite,
    resolveSyncPackPath('source-view.db'));
  try {
    const identity = (await readReadySyncIdentityPage(view.port,
      syncIdentityPartition('node', 'node-1'), null)).entries
      .find((entry) => entry.object_id === 'node-1')!;
    const page = buildSyncIdentityPackPage({ group_id: 'group',
      source_peer_id: sourceId.identity_key, target_peer_id: targetId.identity_key,
      source_view_id: view.sourceViewId, page_index: 0, previous_page_id: null,
      objects: [identity] });
    const archivePath = resolveSyncPackPath('identity.zip');
    await buildSyncIdentityPackFromDriver({ page, outputPath: archivePath }, view.driver);
    const extractedPath = resolveSyncPackPath('incoming.db');
    const manifest = await extractSyncIdentityPackDatabaseFromFile({ archivePath,
      expectedPeerId: targetId.identity_key, expectedSourcePeerId: sourceId.identity_key,
      outputPath: extractedPath });
    const port = createBetterSqliteDbPort(receiver);
    await port.run(`ATTACH DATABASE '${extractedPath}' AS inc`);
    try {
      await port.run("UPDATE inc.node_sync_versions SET snapshot_json = 'not-json'");
      await expect(applySyncIdentityPackWithDbPort(port, manifest,
        { hostName: 'Target' })).rejects.toThrow();
      expect(receiver.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get())
        .toBeUndefined();
      expect(receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get())
        .toEqual({ count: 0 });
      expect(receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_receive_rounds').get())
        .toEqual({ count: 0 });
      await port.run('UPDATE inc.node_sync_versions SET snapshot_json = ?',
        ['{"id":"node-1","title":"Node 1","content":"node body must stay out of pack"}']);
      expect(await applySyncIdentityPackWithDbPort(port, manifest,
        { hostName: 'Target' })).toMatchObject({ applied: true });
      expect(await applySyncIdentityPackWithDbPort(port, manifest,
        { hostName: 'Target' })).toEqual({ applied: false });
      expect(receiver.prepare("SELECT title FROM nodes WHERE id = 'node-1'").get())
        .toMatchObject({ title: 'Node 1' });
      expect(receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get())
        .toEqual({ count: 1 });
      expect(receiver.prepare('SELECT COUNT(*) AS count FROM sync_pack_receive_progress').get())
        .toEqual({ count: 0 });
      expect(receiver.prepare('SELECT COUNT(*) AS count FROM node_version_inbound_receipts').get())
        .toEqual({ count: 0 });
    } finally { await port.run('DETACH DATABASE inc'); }
  } finally { view.close(); receiver.close(); }
});
