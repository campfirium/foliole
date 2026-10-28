import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function readOutputs(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const { loadLibraryPathSettingsSync } = require(pathApi.join(cwd, 'dist/electron/ipc/libraryPaths.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const root = loadLibraryPathSettingsSync().mirror;
      const records = connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      });
    });
  }, process.cwd());
}

test('updates the saved article mirror after editing while preserving unrelated output', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-article', kind: 'topic', title: 'Scoped article', content: 'Initial article body.' },
      { id: 't513-unrelated', kind: 'topic', title: 'Unrelated article', content: 'Unrelated body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
    await window.__folioleWorkspaceDebug!.openNode!('t513-article');
  });
  const before = await readOutputs(desktopApp);
  expect(before).toHaveLength(2);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Initial article body.');
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await editor.click();
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.pressSequentially('Saved mirror update.');

  await expect.poll(async () => (await readOutputs(desktopApp))[0]?.body, { timeout: 90_000 })
    .toContain('Saved mirror update.');
  const after = await readOutputs(desktopApp);
  expect(after[0]!.relative_path).toBe(before[0]!.relative_path);
  expect(after[1]).toEqual(before[1]);
  await testInfo.attach('article-mirror-update', {
    body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json'
  });
});
