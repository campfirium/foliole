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
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-folder-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return { names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

test('migrates nested folder outputs through saved rename and move commands without rewriting unrelated mirrors', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-folder-root', title: 'Alpha', kind: 'folder', content: '' },
      { id: 't513-folder-nested', title: 'Nested', kind: 'folder', parentNodeId: 't513-folder-root', content: '' },
      { id: 't513-folder-a', title: 'A', kind: 'topic', parentNodeId: 't513-folder-nested', content: 'Nested article body.' },
      { id: 't513-folder-second', title: 'Second', kind: 'topic', parentNodeId: 't513-folder-root', content: 'Second article body.' },
      { id: 't513-folder-destination', title: 'Destination', kind: 'folder', content: '' },
      { id: 't513-folder-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated article body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  const before = await readOutputs(desktopApp);
  const outputs = [before];
  for (const title of ['Renamed', 'RENAMED']) {
    const renamed = await desktopWindow.evaluate((next) =>
      window.__folioleWorkspaceDebug!.updateNodeTitle('t513-folder-root', next), title);
    expect(renamed).toBe(true);
    await expect.poll(async () => (await readOutputs(desktopApp)).files
      .filter((file) => file.article_id !== 't513-folder-unrelated').map((file) => file.relative_path), { timeout: 90_000 })
      .toEqual([`${title}/Nested/A.md`, `${title}/Second.md`]);
    const after = await readOutputs(desktopApp);
    expect(after.names).toContain(title);
    expect(after.names).not.toContain(title === 'Renamed' ? 'Alpha' : 'Renamed');
    expect(after.files.find((file) => file.article_id === 't513-folder-unrelated'))
      .toEqual(before.files.find((file) => file.article_id === 't513-folder-unrelated'));
    outputs.push(after);
  }
  const accepted = await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug!.moveNodes(['t513-folder-nested'], 't513-folder-destination', 'child'));
  expect(accepted).toBe(true);
  await expect.poll(async () => (await readOutputs(desktopApp)).files[0]!.relative_path, { timeout: 90_000 })
    .toBe('Destination/Nested/A.md');
  const moved = await readOutputs(desktopApp);
  expect(moved.files[0]!.body).toContain('Nested article body.');
  expect(moved.files.find((file) => file.article_id === 't513-folder-second'))
    .toEqual(outputs.at(-1)!.files.find((file) => file.article_id === 't513-folder-second'));
  expect(moved.files.find((file) => file.article_id === 't513-folder-unrelated'))
    .toEqual(before.files.find((file) => file.article_id === 't513-folder-unrelated'));
  outputs.push(moved);
  await testInfo.attach('folder-migration', { body: JSON.stringify(outputs, null, 2), contentType: 'application/json' });
});
