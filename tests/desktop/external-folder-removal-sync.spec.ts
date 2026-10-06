import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('removes an indexed external folder through the native bridge and keeps durable child deletion facts', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopApp.evaluate(async () => {
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
  await desktopWindow.evaluate(async () => {
    await window.electronAPI!.invoke('remove_external_search_folder', { folder_id: 'removal-sync-folder' });
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect(desktopWindow.getByRole('treeitem', { name: /removal-sync-folder/u })).toHaveCount(0);
  const state = await desktopApp.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      return { documents: driver.queryAll('SELECT document_id FROM external_documents WHERE folder_id = ?',
        ['removal-sync-folder']), state: driver.queryOne(`SELECT deleted_at FROM sync_object_state
          WHERE object_type = 'external_document' AND object_id = ?`, ['removal-sync-folder:article.md']) };
    });
  });
  expect(state.documents).toEqual([]);
  expect(state.state).toMatchObject({ deleted_at: expect.any(String) });
  const screenshot = path.resolve('.tmp/artifacts/external-folder-removal/native-after-removal.png');
  await mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('external-folder-removed', { path: screenshot, contentType: 'image/png' });
});
