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
        "SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id LIKE 't513-clean-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string; mirrored_at: string }>;
      const extras = ['stale-root.md', 'Old/Nested/stale.md', 'Highlights.md', 'Clozes.md', 'Unrelated/manual.txt'];
      return { leftovers: extras.map((relative) => {
        const file = pathApi.join(root, relative);
        return fsApi.existsSync(file) ? { relative, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs } : null;
      }), names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

test('keeps unrelated stale files during automatic single-article output and clears them on full rebuild', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-clean-article', title: 'Before', kind: 'topic', content: 'Original body.' },
      { id: 't513-clean-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  await desktopApp.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const { runWithDatabaseConnectionOwner } = require(`${cwd}/dist/electron/database/connection.js`);
    const { submitDesktopOperation } = require(`${cwd}/dist/electron/desktopOperations.js`);
    const { resumePendingMirrorOutput } = require(`${cwd}/dist/electron/mirror/rebuildMirrorOutput.js`);
    await submitDesktopOperation('mirror-backfill', { run: resumePendingMirrorOutput }).promise;
    await require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
    const { loadLibraryPathSettingsSync } = require(`${cwd}/dist/electron/ipc/libraryPaths.js`);
    await runWithDatabaseConnectionOwner(() => {
      const root = loadLibraryPathSettingsSync().mirror;
      const fsApi = process.getBuiltinModule('fs')!;
      const pathApi = process.getBuiltinModule('path')!;
      for (const relative of ['stale-root.md', 'Old/Nested/stale.md', 'Highlights.md', 'Clozes.md', 'Unrelated/manual.txt', 'Before/manual.txt']) {
        const file = pathApi.join(root, relative);
        fsApi.mkdirSync(pathApi.dirname(file), { recursive: true });
        fsApi.writeFileSync(file, `Preserved content for ${relative}.`);
      }
    });
  }, process.cwd());
  const before = await readOutputs(desktopApp);
  const updated = await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug!.updateNodeContent('t513-clean-article', 'Updated body.'));
  expect(updated).toBe(true);
  await expect.poll(async () => (await readOutputs(desktopApp)).files[0]!.body, { timeout: 90_000 }).toContain('Updated body.');
  const after = await readOutputs(desktopApp);
  expect(after.leftovers).toEqual(before.leftovers);
  expect(after.files[1]).toEqual(before.files[1]);
  expect(after.names).not.toContain('Before');
  await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
  const rebuilt = await readOutputs(desktopApp);
  expect(rebuilt.leftovers).toEqual([null, null, null, null, null]);
  expect(rebuilt.files[0]!.body).toContain('Updated body.');
  expect(rebuilt.files[1]!.body).toBe(before.files[1]!.body);
  await testInfo.attach('incremental-cleanup-scope', {
    body: JSON.stringify({ before, after, rebuilt }, null, 2), contentType: 'application/json'
  });
});
