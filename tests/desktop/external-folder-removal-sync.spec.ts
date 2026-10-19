import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const mode of ['local', 'remote', 'member'] as const) {
test(`removes an indexed external folder through ${mode} ${mode === 'member' ? 'departure without deletion records' : 'deletion and keeps durable child deletion facts'}`, async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopApp.evaluate(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const root = process.env.FOLIOLE_LIBRARY_HOME;
    if (!root) throw new Error('isolated_library_required');
    const folderPath = pathApi.join(root, 'removal-sync-folder');
    fsApi.mkdirSync(folderPath, { recursive: true });
    fsApi.writeFileSync(pathApi.join(folderPath, 'article.md'), '# Removal sync article\n\nOriginal article body');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const folders = require(pathApi.join(process.cwd(), 'dist/electron/database/externalSearchFolders.js'));
    const cache = require(pathApi.join(process.cwd(), 'dist/electron/database/externalSearchCache.js'));
    await connection.runWithDatabaseConnectionOwner(async () => {
      folders.saveExternalSearchFolders([{ id: 'removal-sync-folder', folder_path: folderPath,
        attachment_mode: 'document_relative_first_then_fixed_root', attachment_root_path: null, excluded_dirs: [] }]);
      await cache.rebuildExternalSearchIndexes('removal-sync-folder');
    });
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.getByRole('treeitem', { name: /removal-sync-folder/u }).click();
  await desktopWindow.getByRole('treeitem', { name: /Removal sync article/u }).click();
  await expect(desktopWindow.getByText('Original article body', { exact: true })).toBeVisible();
  if (mode === 'local') await desktopWindow.evaluate(async () => {
    await window.electronAPI!.invoke('remove_external_search_folder', { folder_id: 'removal-sync-folder' });
  });
  else if (mode === 'remote') await applyRemoteFolderDeletion(desktopApp);
  else {
    const deviceId = await seedRemoteProvider(desktopApp);
    await desktopWindow.evaluate((id) => window.electronAPI!.invoke('remove_sync_group_device', { device_identity_key: id }), deviceId);
  }
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect(desktopWindow.getByRole('treeitem', { name: /removal-sync-folder/u })).toHaveCount(0);
  const state = await readRemovalState(desktopApp);
  expect(state.original).toBe('# Removal sync article\n\nOriginal article body');
  expect(state.documents).toEqual([]);
  expect(state.sources).toEqual([]);
  if (mode === 'member') expect(state.state ?? null).toBeNull();
  else expect(state.state).toMatchObject({ deleted_at: expect.any(String) });
  const screenshot = path.resolve(`.tmp/artifacts/external-folder-removal/native-after-${mode}-removal.png`);
  await mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('external-folder-removed', { path: screenshot, contentType: 'image/png' });
});
}

async function applyRemoteFolderDeletion(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async () => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), `dist/${name}.js`));
    const connection = load('electron/database/connection');
    const { computeSyncContentHash } = load('lib/core/database/syncState');
    const { buildCanonicalSyncTombstone } = load('lib/core/sync/canonicalSyncTombstone');
    const now = new Date().toISOString();
    await connection.runWithDatabaseConnectionOwner(() => load('electron/database/syncObjectApply').applySyncObjectsAsync([{
      object_type: 'external_folder', object_id: 'removal-sync-folder', deleted_at: now, updated_at: now,
      payload_json: null, content_hash: computeSyncContentHash('external_folder', buildCanonicalSyncTombstone('removal-sync-folder'))
    }]));
  });
}

async function seedRemoteProvider(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (file: string) => require(`${process.cwd()}/dist/${file}.js`);
    const connection = load('electron/database/connection');
    return connection.runWithDatabaseConnectionOwner(() => {
      const groups = load('electron/database/syncGroupStore');
      const { createSyncGroupDeviceIdentity } = load('lib/platform/syncGroupUnifiedContract');
      const groupId = 'external-removal-group';
      const local = createSyncGroupDeviceIdentity({
        device_anchor: '11111111-1111-4111-8111-111111111111', group_id: groupId,
        library_path: connection.openDatabaseConnection().dbPath, path_flavor: 'posix' });
      const remote = createSyncGroupDeviceIdentity({
        device_anchor: '22222222-2222-4222-8222-222222222222', group_id: groupId,
        library_path: '/remote/foliole.db', path_flavor: 'posix' });
      groups.createDesktopSyncGroup({ device: local, deviceName: 'Local', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: remote, deviceName: 'Remote', platform: 'darwin' });
      connection.openDatabaseConnection().driver.execute(`UPDATE desktop_sources
        SET type_settings_json = json_set(type_settings_json, '$.ownerDeviceIdentityKey', ?)
        WHERE source_ref = 'external:removal-sync-folder'`, [remote.identity_key]);
      return remote.identity_key;
    });
  });
}

async function readRemovalState(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      return { original: process.getBuiltinModule('fs')!.readFileSync(pathApi.join(process.env.FOLIOLE_LIBRARY_HOME!, 'removal-sync-folder', 'article.md'), 'utf8'),
        sources: driver.queryAll("SELECT source_ref FROM desktop_sources WHERE source_type = 'external' AND config_ref = ?",
        ['removal-sync-folder']), documents: driver.queryAll('SELECT document_id FROM external_documents WHERE folder_id = ?',
        ['removal-sync-folder']), state: driver.queryOne(`SELECT deleted_at FROM sync_object_state
          WHERE object_type = 'external_document' AND object_id = ?`, ['removal-sync-folder:article.md']) };
    });
  });
}
