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
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id LIKE 't513-multi-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return { names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

async function configureExportDialog(app: ElectronApplication) {
  return app.evaluate(({ dialog }) => {
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/multi-range-export.md`;
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

function expectHighlightFacts(body: string, unresolved: boolean) {
  expect(body).toContain(unresolved ? '(❄ highlight: Gamma)' : '==Gamma==');
  expect(body).toContain('==Alpha==');
  expect(body.match(/Saved shared note\./g)).toHaveLength(1);
}

async function exportFromPalette(app: ElectronApplication, page: import('@playwright/test').Page, body: string) {
  const output = await configureExportDialog(app);
  try {
    await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('t513-multi-manual'));
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
    const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
    await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('export');
    await palette.getByRole('button', { name: /^(Export Current Topic|导出当前主题)$/ }).click();
    await expect.poll(() => app.evaluate((_, file) => {
      const fsApi = process.getBuiltinModule('fs')!;
      return fsApi.existsSync(file) ? fsApi.readFileSync(file, 'utf8') : null;
    }, output)).toBe(body);
  } finally {
    await app.evaluate(() => (globalThis as unknown as { restoreItemDialog: () => void }).restoreItemDialog());
  }
}

for (const unresolved of [false, true]) {
  test(`keeps every saved highlight segment through automatic, single and full output, unresolved=${unresolved}`, async ({
    desktopApp, desktopWindow
  }, testInfo) => {
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
    await desktopWindow.evaluate(async () => {
      await window.__folioleWorkspaceDebug!.seedNodes([
        { id: 't513-multi-manual', title: 'Multi-range Topic', kind: 'topic', content: 'Alpha Beta Gamma Delta' },
        { id: 't513-multi-highlight', title: 'Annotation', kind: 'topic', parentNodeId: 't513-multi-manual', content: 'Alpha\nGamma',
          anchorLink: { id: 'multi', kind: 'highlight', locator: { ranges: [
            { from: 0, to: 5, originalText: 'Alpha' }, { from: 11, to: 16, originalText: 'Gamma' }
          ] } } },
        { id: 't513-multi-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
      ], { persist: true });
      await window.electronAPI!.invoke('rebuild_mirror_output');
    });
    await settleInitialMirror(desktopApp);
    const before = await readOutputs(desktopApp);
    await desktopWindow.evaluate((unresolved) => window.electronAPI!.invoke('update_node_content', {
      nodeId: 't513-multi-highlight', parentNodeId: 't513-multi-manual', kind: 'topic', title: 'Annotation',
      content: 'Alpha\nGamma\n※ Saved shared note.', reveal: null, isTitleManual: true, hideTitleHeading: false, position: 0,
      anchorLink: { id: 'multi', kind: 'highlight', locator: { ranges: [
        { from: 0, to: 5, originalText: 'Alpha' }, { from: 11, to: unresolved ? 11 : 16, originalText: 'Gamma' }
      ] } }, createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
    }), unresolved);
    await expect.poll(async () => (await readOutputs(desktopApp)).files[0]!.body, { timeout: 30_000 }).toContain('Saved shared note.');
    const after = await readOutputs(desktopApp);
    expectHighlightFacts(after.files[0]!.body, unresolved);
    expect(after.files[1]).toEqual(before.files[1]);
    await exportFromPalette(desktopApp, desktopWindow, after.files[0]!.body);
    await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
    const rebuilt = await readOutputs(desktopApp);
    expect(rebuilt.files[0]!.body).toBe(after.files[0]!.body);
    await testInfo.attach('multi-range-output', {
      body: JSON.stringify({ before, after, rebuilt }, null, 2), contentType: 'application/json'
    });
  });
}
