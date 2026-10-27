import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function readOutputs(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    const { loadLibraryPathSettingsSync } = require(`${cwd}/dist/electron/ipc/libraryPaths.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const root = loadLibraryPathSettingsSync().mirror;
      const records = connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-trash-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return { names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

test('removes a trashed article mirror and restores its saved content through native commands', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-trash-folder', title: 'Folder', kind: 'folder', content: '' },
      { id: 't513-trash-article', title: 'Article', kind: 'topic', parentNodeId: 't513-trash-folder', content: 'Retained saved body.' },
      { id: 't513-trash-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  const before = await readOutputs(desktopApp);
  expect(before.files[0]!.body).toContain('Retained saved body.');
  await desktopWindow.evaluate(() => window.electronAPI!.invoke('soft_delete_nodes', {
    nodeIds: ['t513-trash-article'], deletedAt: new Date().toISOString()
  }));
  await expect.poll(async () => (await readOutputs(desktopApp)).files.map((file) => file.article_id), { timeout: 30_000 })
    .toEqual(['t513-trash-unrelated']);
  const trashed = await readOutputs(desktopApp);
  expect(trashed.names).not.toContain('Folder');
  expect(trashed.files[0]).toEqual(before.files[1]);
  const restored = await desktopWindow.evaluate(() => window.electronAPI!.invoke('restore_nodes', {
    nodeIds: ['t513-trash-article']
  }));
  expect(restored.restoredNodeIds).toEqual(['t513-trash-article']);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.map((file) => file.article_id), { timeout: 30_000 })
    .toEqual(['t513-trash-article', 't513-trash-unrelated']);
  const after = await readOutputs(desktopApp);
  expect(after.files[0]!.relative_path).toBe('Folder/Article.md');
  expect(after.files[0]!.body).toBe(before.files[0]!.body);
  expect(after.files[1]).toEqual(before.files[1]);
  await testInfo.attach('mirror-trash-roundtrip', {
    body: JSON.stringify({ before, trashed, after }, null, 2), contentType: 'application/json'
  });
});
