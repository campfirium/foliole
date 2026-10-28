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
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-move-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return { names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

async function configureTopicExportDialog(app: ElectronApplication) {
  return app.evaluate(({ dialog }) => {
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/moved-topic-export.md`;
    const original = dialog.showSaveDialog;
    (globalThis as unknown as { restoreTopicDialog: () => void }).restoreTopicDialog = () => { dialog.showSaveDialog = original; };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    return filePath;
  });
}

async function settleInitialMirror(app: ElectronApplication) {
  await app.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const { submitDesktopOperation } = require(`${cwd}/dist/electron/desktopOperations.js`);
    const { resumePendingMirrorOutput } = require(`${cwd}/dist/electron/mirror/rebuildMirrorOutput.js`);
    await submitDesktopOperation('mirror-backfill', { run: resumePendingMirrorOutput }).promise;
    await require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
  }, process.cwd());
}

test('automatically migrates a manual Topic subtree and exports the same saved child', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-move-old', title: 'Old', kind: 'folder', content: '' },
      { id: 't513-move-new', title: 'New', kind: 'folder', content: '' },
      { id: 't513-move-manual', title: 'Moving', kind: 'topic', parentNodeId: 't513-move-old', content: 'Moving saved body.' },
      { id: 't513-move-child', title: 'Child', kind: 'topic', parentNodeId: 't513-move-manual', content: 'Question body.', reveal: 'Saved answer.' },
      { id: 't513-move-note', title: 'Note', kind: 'topic', parentNodeId: 't513-move-child', content: 'Child annotation.',
        anchorLink: { id: 'move-highlight', kind: 'highlight', locator: { from: 0, to: 8, originalText: 'Question' } } },
      { id: 't513-move-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  await settleInitialMirror(desktopApp);
  const before = await readOutputs(desktopApp);
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.moveNodes(
    ['t513-move-manual'], 't513-move-new', 'child'))).toBe(true);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === 't513-move-child')?.relative_path,
    { timeout: 90_000 }).toBe('New/Child.md');
  const after = await readOutputs(desktopApp);
  expect(after.files.find((file) => file.article_id === 't513-move-unrelated'))
    .toEqual(before.files.find((file) => file.article_id === 't513-move-unrelated'));
  expect(after.names).not.toContain('Old');
  const body = after.files.find((file) => file.article_id === 't513-move-child')!.body;
  expect(body).toContain('Child annotation.');
  const output = await configureTopicExportDialog(desktopApp);
  try {
    await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.openNode('t513-move-child'));
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
    const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
    await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('export');
    await palette.screenshot({ path: '.tmp/artifacts/T513/1k-a/move-export-palette.png' });
    await palette.getByRole('button', { name: /^(Export Current Topic|导出当前主题)$/ }).click();
    await expect.poll(() => desktopApp.evaluate((_, file) => {
      const fsApi = process.getBuiltinModule('fs')!;
      return fsApi.existsSync(file) ? fsApi.readFileSync(file, 'utf8') : null;
    }, output)).toBe(body);
    await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
    const rebuilt = await readOutputs(desktopApp);
    expect(rebuilt.files.find((file) => file.article_id === 't513-move-child')!.body).toBe(body);
    await testInfo.attach('moved-topic-output', {
      body: JSON.stringify({ before, after, rebuilt, output }, null, 2), contentType: 'application/json'
    });
  } finally {
    await desktopApp.evaluate(() => (globalThis as unknown as { restoreTopicDialog: () => void }).restoreTopicDialog());
  }
});
