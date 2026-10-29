import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function prepareWatchedTopic(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    const fsApi = process.getBuiltinModule('fs');
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!fsApi || !moduleApi || !pathApi || !libraryHome) throw new Error('isolated source unavailable');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const importer = require(pathApi.join(cwd, 'dist/electron/import/keepImportService.js'));
    const manager = require(pathApi.join(cwd, 'dist/electron/import/importManagerSettings.js'));
    return connection.runWithDatabaseConnectionOwner(async () => {
      const source = pathApi.join(libraryHome, 'reimport-source');
      fsApi.mkdirSync(source, { recursive: true });
      const file = pathApi.join(source, 'topic.md');
      fsApi.writeFileSync(file, '# Reimport workspace topic\n\nOriginal source paragraph.\n');
      manager.saveImportManagerSettings({ sources: [{ actionMode: 'keep', archivePath: '',
        highlightMode: 'merged', highlightPath: '', id: 'workspace-reimport-source', keepPreview: null,
        keepState: 'enabled', primaryPath: source }] });
      await importer.runKeepImportRule({ directoryPath: source, highlightPolicy: 'adopt', ruleId: 'workspace-reimport-source' });
      const row = connection.openDatabaseConnection().driver.queryOne(
        'SELECT last_node_id FROM keep_import_items WHERE rule_id = ?', ['workspace-reimport-source']);
      if (!row) throw new Error('topic was not imported');
      return { nodeId: row.last_node_id as string, file };
    });
  }, process.cwd());
}

test('updates the current workspace after reimport while retaining the content notification and persisted source', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  const topic = await prepareWatchedTopic(desktopApp);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(nodeId => Boolean(window.__folioleWorkspaceDebug?.getNode(nodeId)), topic.nodeId);
  expect(await desktopWindow.evaluate(nodeId => window.__folioleWorkspaceDebug!.openNode(nodeId), topic.nodeId)).toBe(true);
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await expect(editor).toContainText('Original source paragraph.');
  const content = '# Reimport workspace topic\n\nUpdated source paragraph.\n';
  await fs.writeFile(topic.file, content);
  await desktopWindow.evaluate(() => {
    const seen: unknown[] = [];
    (window as unknown as { reimportNotifications: unknown[] }).reimportNotifications = seen;
    window.electronAPI!.onWorkspaceContentChanged!(payload => seen.push(payload));
  });
  await editor.click();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
  const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('reimport');
  await palette.getByRole('button', { name: /^(Dev: Re-import Selected Topic|DEV 重新导入所选主题)$/ }).click();
  await expect(editor).toContainText('Updated source paragraph.');
  expect(await desktopWindow.evaluate(() =>
    (window as unknown as { reimportNotifications: unknown[] }).reimportNotifications
  )).toContainEqual(expect.objectContaining({ scope: 'workspace', refreshWorkspace: false, workspaceScope: { kind: 'full' } }));
  expect(await fs.readFile(topic.file, 'utf8')).toBe(content);
  const screenshot = path.resolve('.tmp/artifacts/T623/reimport-reading.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('reimport-reading', { path: screenshot });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(nodeId => Boolean(window.__folioleWorkspaceDebug?.getNode(nodeId)), topic.nodeId);
  await desktopWindow.evaluate(nodeId => window.__folioleWorkspaceDebug!.openNode(nodeId), topic.nodeId);
  await expect(editor).toContainText('Updated source paragraph.');
});
