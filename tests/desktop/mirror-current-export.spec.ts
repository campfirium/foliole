import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function configureExportDialog(app: ElectronApplication) {
  return app.evaluate(({ dialog }) => {
    const pathApi = process.getBuiltinModule('path')!;
    const outputPath = pathApi.join(process.env.FOLIOLE_LIBRARY_HOME!, 'current-export.md');
    const original = dialog.showSaveDialog;
    const state = globalThis as unknown as { finishMirrorExportDialog: () => void; restoreMirrorExportDialog: () => void };
    state.restoreMirrorExportDialog = () => { dialog.showSaveDialog = original; };
    dialog.showSaveDialog = () => new Promise((resolve) => {
      process.env.FOLIOLE_TEST_MIRROR_DIALOG_PENDING = '1';
      state.finishMirrorExportDialog = () => resolve({ canceled: false, filePath: outputPath });
    });
    return outputPath;
  });
}

async function readFiles(app: ElectronApplication, outputPath: string) {
  return app.evaluate(async (_, args) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const require = moduleApi.createRequire(pathApi.join(args.cwd, 'package.json'));
    const connection = require(pathApi.join(args.cwd, 'dist/electron/database/connection.js'));
    const { loadLibraryPathSettingsSync } = require(pathApi.join(args.cwd, 'dist/electron/ipc/libraryPaths.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const paths = loadLibraryPathSettingsSync();
      const records = connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id IN ('t513-export', 't513-unrelated') ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return {
        independent: connection.openDatabaseConnection().driver.queryAll(
          "SELECT article_id, relative_path FROM mirror_articles WHERE article_id IN ('t513-note', 't513-nested-note') ORDER BY article_id"
        ).map((record: { article_id: string; relative_path: string }) => ({ ...record,
          body: fsApi.readFileSync(pathApi.join(paths.mirror, record.relative_path), 'utf8') })),
        exported: fsApi.existsSync(args.outputPath) ? fsApi.readFileSync(args.outputPath, 'utf8') : null,
        files: records.map((record) => {
          const file = pathApi.join(paths.mirror, record.relative_path);
          return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
        }),
        source: connection.openDatabaseConnection().driver.queryOne('SELECT content FROM nodes WHERE id = ?', ['t513-export']) as { content: string },
        assetPath: pathApi.join(paths.assets_dir, `${'a'.repeat(64)}.png`)
      };
    });
  }, { cwd: process.cwd(), outputPath });
}

async function seedExportArticle(page: Page) {
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-export', kind: 'topic', title: 'Current export', content: `---\nauthor: Ada\n---\nSaved body. ![image](asset://${'a'.repeat(64)}.png)` },
      { id: 't513-note', kind: 'topic', title: 'Note', parentNodeId: 't513-export', content: 'First note.' },
      { id: 't513-nested-note', kind: 'topic', title: 'Nested', parentNodeId: 't513-note', content: 'Nested note.' },
      { id: 't513-unrelated', kind: 'topic', title: 'Unrelated export', content: 'Unrelated body.' }
    ], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
    await window.__folioleWorkspaceDebug!.openNode!('t513-export');
  });
}

test('exports the saved current article through the palette with the same content as automatic mirrors', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedExportArticle(desktopWindow);
  const outputPath = await configureExportDialog(desktopApp);
  try {
    const before = await readFiles(desktopApp, outputPath);
    const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
    await expect(editor).toContainText('Saved body.');
    await editor.click();
    await editor.press('ControlOrMeta+End');
    await editor.press('Enter');
    await editor.pressSequentially('Fresh current export.');
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
    const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
    await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('export');
    await palette.getByRole('button', { name: /^(Export Current Topic|导出当前主题)$/ }).click();
    await expect.poll(() => desktopApp.evaluate(() => process.env.FOLIOLE_TEST_MIRROR_DIALOG_PENDING)).toBe('1');
    const whileWaiting = await readFiles(desktopApp, outputPath);
    expect(whileWaiting.source.content).toContain('Fresh current export.');
    await desktopWindow.evaluate(async (content) => {
      await window.__folioleWorkspaceDebug!.updateNodeContent!('t513-export', `${content}\nSaved during dialog.`);
    }, whileWaiting.source.content);
    await expect.poll(async () => (await readFiles(desktopApp, outputPath)).source.content)
      .toContain('Saved during dialog.');
    await desktopApp.evaluate(() => (globalThis as unknown as { finishMirrorExportDialog: () => void }).finishMirrorExportDialog());
    await expect.poll(async () => (await readFiles(desktopApp, outputPath)).exported).toContain('Saved during dialog.');
    await desktopApp.evaluate(async (_, cwd) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
      await require(`${cwd}/dist/electron/mirror/mirrorOutputSync.js`).syncIncrementalMirrorOutput(['t513-export']);
    }, process.cwd());
    const after = await readFiles(desktopApp, outputPath);
    expect(after.exported).toBe(after.files[0]!.body);
    expect(after.exported).toContain('author: Ada');
    expect(after.exported).not.toContain('Nested note.');
    expect(after.exported).not.toContain('First note.');
    expect(after.independent).toEqual(before.independent);
    expect(after.independent.map((file) => file.body)).toEqual([
      expect.stringContaining('Nested note.'), expect.stringContaining('First note.')
    ]);
    expect(after.exported).toContain(after.assetPath);
    expect(after.files[1]).toEqual(before.files[1]);
    await testInfo.attach('current-article-export', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
  } finally {
    await desktopApp.evaluate(() => {
      const state = globalThis as unknown as { finishMirrorExportDialog?: () => void; restoreMirrorExportDialog: () => void };
      state.finishMirrorExportDialog?.();
      state.restoreMirrorExportDialog();
    });
  }
});
