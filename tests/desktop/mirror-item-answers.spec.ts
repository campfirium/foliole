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
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-item-%' ORDER BY article_id"
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
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/manual-item-export.md`;
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

function expectSavedItemFacts(body: string) {
  expect(body).toContain('Saved question edit.');
  expect(body).toContain('Changed answer.\n\nSecond paragraph.');
  expect(body).not.toContain('Saved answer fact.');
  expect(body.match(/Changed answer\./g)).toHaveLength(1);
  expect(body).toContain('Initial annotation.');
}

for (const parent of [null, 't513-item-folder', 'special-inbox', 't513-item-topic'] as const) {
test(`outputs saved question and answer changes for a ${parent === 't513-item-topic' ? 'Topic-level' : parent === 'special-inbox' ? 'Inbox' : parent ? 'folder-level' : 'root'} Item through automatic, export and full paths`, async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async (parent) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-item-folder', title: 'Folder', kind: 'folder', content: '' },
      { id: 't513-item-topic', title: 'Parent Topic', kind: 'topic', content: 'Parent body.' },
      { id: 't513-item-manual', title: 'Manual Item', kind: 'item', parentNodeId: parent, content: 'Question body.', reveal: 'Saved answer fact.' },
      { id: 't513-item-highlight', title: 'Annotation', kind: 'topic', parentNodeId: 't513-item-manual', content: 'Initial annotation.',
        anchorLink: { id: 'item-highlight', kind: 'highlight', locator: { from: 0, to: 8, originalText: 'Question' } } },
      { id: 't513-item-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  }, parent);
  await settleInitialMirror(desktopApp);
  const before = await readOutputs(desktopApp);
  expect(before.files[0]!.relative_path).toBe(parent === 't513-item-folder' ? 'Folder/Manual Item.md' : parent === 'special-inbox' ? 'Inbox/Manual Item.md' : 'Manual Item.md');
  expect(before.files[0]!.body).toContain('Initial annotation.');
  expect(before.files[0]!.body.match(/Saved answer fact\./g)).toHaveLength(1);
  await desktopWindow.evaluate((parent) => window.electronAPI!.invoke('update_node_content', {
    nodeId: 't513-item-manual', parentNodeId: parent, kind: 'item', title: 'Manual Item',
    content: 'Question body. Saved question edit.', reveal: 'Changed answer.\n\nSecond paragraph.', isTitleManual: true, hideTitleHeading: false, position: 2,
    anchorLink: null,
    createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
  }), parent);
  await expect.poll(async () => (await readOutputs(desktopApp)).files[0]!.body, { timeout: 30_000 }).toContain('Changed answer.');
  const after = await readOutputs(desktopApp);
  expectSavedItemFacts(after.files[0]!.body);
  expect(after.files.filter((file) => file.article_id !== 't513-item-manual')).toEqual(
    before.files.filter((file) => file.article_id !== 't513-item-manual'));
  const output = await configureItemExportDialog(desktopApp);
  try {
    await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.openNode('t513-item-manual'));
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
    const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
    await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('export');
    await palette.screenshot({ path: `.tmp/artifacts/T513/2a/${parent ?? 'root'}-item-export-palette.png` });
    await palette.getByRole('button', { name: /^(Export Current Topic|导出当前主题)$/ }).click();
    await expect.poll(() => desktopApp.evaluate((_, file) => {
      const fsApi = process.getBuiltinModule('fs')!;
      return fsApi.existsSync(file) ? fsApi.readFileSync(file, 'utf8') : null;
    }, output)).toBe(after.files[0]!.body);
    const body = await desktopApp.evaluate((_, file) => process.getBuiltinModule('fs')!.readFileSync(file, 'utf8'), output);
    expect(body).toBe(after.files[0]!.body);
    await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
    const rebuilt = await readOutputs(desktopApp);
    expect(rebuilt.files[0]!.body).toBe(body);
    expect(rebuilt.files[1]!.body).toBe(before.files[1]!.body);
    await testInfo.attach('manual-item-output', {
      body: JSON.stringify({ before, after, rebuilt, output }, null, 2), contentType: 'application/json'
    });
  } finally {
    await desktopApp.evaluate(() => (globalThis as unknown as { restoreItemDialog: () => void }).restoreItemDialog());
  }
});
}
