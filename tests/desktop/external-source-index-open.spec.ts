import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedIndexedExternalSource(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(async ({ app }, cwd) => {
    const fsApi = process.getBuiltinModule('fs');
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!fsApi || !moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const sourceRoot = pathApi.join(libraryHome, 't135-17-external');
    const documentPath = pathApi.join(sourceRoot, 'topic.md');
    fsApi.mkdirSync(sourceRoot, { recursive: true });
    fsApi.writeFileSync(documentPath, '# T135 External Topic\n\nT135 external live body', 'utf8');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const folders = require(pathApi.join(cwd, 'dist/electron/database/externalSearchFolders.js'));
    const cache = require(pathApi.join(cwd, 'dist/electron/database/externalSearchCache.js'));
    await connection.runWithDatabaseConnectionOwner(async () => {
      folders.saveExternalSearchFolders([{
        attachment_mode: 'document_relative_first_then_fixed_root',
        attachment_root_path: null,
        excluded_dirs: [],
        folder_path: sourceRoot,
        id: 't135-17-external'
      }]);
      await cache.rebuildExternalSearchIndexes('t135-17-external');
    });
    return { documentPath, sourceRoot, userData: app.getPath('userData') };
  }, process.cwd());
}

test('indexes and opens an External document through its Source Location', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const fixture = await seedIndexedExternalSource(desktopApp);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  await desktopWindow.getByRole('treeitem', { name: /t135-17-external/u }).click();
  await desktopWindow.getByRole('treeitem', { name: /T135 External Topic/u }).click();
  await expect(desktopWindow.getByText('T135 external live body', { exact: true })).toBeVisible();

  const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
    't135-17-external-index-open-hidden-native.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('t135-17-external-index-open', { path: screenshotPath, contentType: 'image/png' });
  expect(fixture.documentPath).toBe(path.join(fixture.sourceRoot, 'topic.md'));
});
