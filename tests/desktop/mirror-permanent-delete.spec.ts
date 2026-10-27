import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function readOutputs(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    const { loadLibraryPathSettingsSync } = require(`${cwd}/dist/electron/ipc/libraryPaths.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const root = loadLibraryPathSettingsSync().mirror;
      const records = connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-permanent-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return { names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

test('permanently deletes a mirror before the Trash debounce without pruning unrelated files', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopApp.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const { submitDesktopOperation } = require(`${cwd}/dist/electron/desktopOperations.js`);
    const { resumePendingMirrorOutput } = require(`${cwd}/dist/electron/mirror/rebuildMirrorOutput.js`);
    await submitDesktopOperation('mirror-backfill', { run: resumePendingMirrorOutput }).promise;
  }, process.cwd());
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-permanent-folder', title: 'Folder', kind: 'folder', content: '' },
      { id: 't513-permanent-article', title: 'Article', kind: 'topic', parentNodeId: 't513-permanent-folder', content: 'Deleted mirror body.' },
      { id: 't513-permanent-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  await desktopApp.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const { loadLibraryPathSettingsSync } = require(`${cwd}/dist/electron/ipc/libraryPaths.js`);
    process.getBuiltinModule('fs')!.writeFileSync(`${loadLibraryPathSettingsSync().mirror}/unrelated-stale.txt`, 'keep me');
  }, process.cwd());
  const before = await readOutputs(desktopApp);
  expect(before.files[0]!.body).toContain('Deleted mirror body.');
  await desktopWindow.evaluate(async () => {
    await window.electronAPI!.invoke('soft_delete_nodes', {
      nodeIds: ['t513-permanent-article'], deletedAt: new Date().toISOString()
    });
    await window.electronAPI!.invoke('delete_nodes_permanently', {
      nodeIds: ['t513-permanent-article'], nodeOrder: []
    });
  });
  const after = await readOutputs(desktopApp);
  expect(after.files).toEqual([before.files[1]]);
  expect(after.names).not.toContain('Folder');
  expect(after.names).toContain('unrelated-stale.txt');
  await testInfo.attach('permanent-mirror-retirement', {
    body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json'
  });
});
