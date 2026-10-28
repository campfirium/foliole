import type { ElectronApplication, Page } from '@playwright/test';

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
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-item-move-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return { names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

async function configureItemExportDialog(app: ElectronApplication) {
  return app.evaluate(({ dialog }) => {
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/moved-item-export.md`;
    const original = dialog.showSaveDialog;
    (globalThis as unknown as { restoreItemDialog: () => void }).restoreItemDialog = () => { dialog.showSaveDialog = original; };
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

async function reloadPersistedInbox(page: Page) {
  const before = await page.evaluate(() => window.__folioleWorkspaceDebug!.listNodes()
    .filter((node) => node.parentNodeId === 'special-inbox').map((node) => ({ id: node.id, title: node.title })));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  const after = await page.evaluate(() => window.__folioleWorkspaceDebug!.listNodes()
    .filter((node) => node.parentNodeId === 'special-inbox').map((node) => ({ id: node.id, title: node.title })));
  return { before, after };
}

for (const target of ['t513-item-move-new', 'special-inbox', 't513-item-move-topic'] as const) {
test(`moves a manual Item to ${target} and exports the same saved input`, async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-item-move-old', title: 'Old', kind: 'folder', content: '' },
      { id: 't513-item-move-new', title: 'New', kind: 'folder', content: '' },
      { id: 't513-item-move-topic', title: 'Parent', kind: 'topic', content: 'Parent saved body.' },
      { id: 't513-item-move-manual', title: 'Moving', kind: 'item', parentNodeId: 't513-item-move-old', content: 'Question body.', reveal: 'Saved answer.' },
      { id: 't513-item-move-note', title: 'Note', kind: 'topic', parentNodeId: 't513-item-move-manual', content: 'Child annotation.',
        anchorLink: { id: 'move-highlight', kind: 'highlight', locator: { from: 0, to: 8, originalText: 'Question' } } },
      { id: 't513-item-move-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  if (target === 'special-inbox') {
    await testInfo.attach('persisted-inbox-baseline', {
      body: JSON.stringify(await reloadPersistedInbox(desktopWindow), null, 2), contentType: 'application/json'
    });
  }
  await settleInitialMirror(desktopApp);
  const before = await readOutputs(desktopApp);
  expect(await desktopWindow.evaluate((target) => window.__folioleWorkspaceDebug!.moveNodes(
    ['t513-item-move-manual'], target, 'child'), target)).toBe(true);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === 't513-item-move-manual')?.relative_path,
    { timeout: 90_000 }).toBe(`${target === 't513-item-move-new' ? 'New/' : target === 'special-inbox' ? 'Inbox/' : ''}Moving.md`);
  const after = await readOutputs(desktopApp);
  expect(after.files.filter((file) => file.article_id !== 't513-item-move-manual'))
    .toEqual(before.files.filter((file) => file.article_id !== 't513-item-move-manual'));
  expect(after.names).not.toContain('Old');
  const body = after.files.find((file) => file.article_id === 't513-item-move-manual')!.body;
  expect(body).toContain('Child annotation.');
  const output = await configureItemExportDialog(desktopApp);
  try {
    await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.openNode('t513-item-move-manual'));
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
    const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
    await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('export');
    await palette.screenshot({ path: `.tmp/artifacts/T513/1k-b/${target}-move-export-palette.png` });
    await palette.getByRole('button', { name: /^(Export Current Topic|导出当前主题)$/ }).click();
    await expect.poll(() => desktopApp.evaluate((_, file) => {
      const fsApi = process.getBuiltinModule('fs')!;
      return fsApi.existsSync(file) ? fsApi.readFileSync(file, 'utf8') : null;
    }, output)).toBe(body);
    await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
    const rebuilt = await readOutputs(desktopApp);
    expect(rebuilt.files.find((file) => file.article_id === 't513-item-move-manual')!.body).toBe(body);
    await testInfo.attach('moved-item-output', {
      body: JSON.stringify({ before, after, rebuilt, output }, null, 2), contentType: 'application/json'
    });
  } finally {
    await desktopApp.evaluate(() => (globalThis as unknown as { restoreItemDialog: () => void }).restoreItemDialog());
  }
});
}
