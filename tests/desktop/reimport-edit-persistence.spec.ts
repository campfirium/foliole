import fs from 'node:fs/promises';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const TITLE = 'Reimport edit source';
const ORIGINAL = `# ${TITLE}\n\nOriginal tracked body.`;
const UPDATED = `# ${TITLE}\n\nReimported complete body 中😀.\n`;
const APPEND = 'Accepted keyboard append after reimport.';

async function prepareSource(app: DesktopSession['electronApp']) {
  return app.evaluate(async (_, original) => {
    const fsApi = process.getBuiltinModule('fs')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const importer = require(pathApi.join(process.cwd(), 'dist/electron/import/keepImportService.js'));
    const manager = require(pathApi.join(process.cwd(), 'dist/electron/import/importManagerSettings.js'));
    const directory = pathApi.join(process.env.FOLIOLE_LIBRARY_HOME!, 'reimport-edit-source');
    const file = pathApi.join(directory, 'source.md');
    fsApi.mkdirSync(directory, { recursive: true });
    fsApi.writeFileSync(file, original);
    return connection.runWithDatabaseConnectionOwner(async () => {
      const ruleId = 'reimport-edit-source';
      manager.saveImportManagerSettings({ sources: [{ actionMode: 'keep', archivePath: '',
        highlightMode: 'merged', highlightPath: '', id: ruleId, keepPreview: null,
        keepState: 'enabled', primaryPath: directory }] });
      await importer.runKeepImportRule({ directoryPath: directory, highlightPolicy: 'adopt', ruleId });
      const row = connection.openDatabaseConnection().driver.queryOne(
        'SELECT last_node_id FROM keep_import_items WHERE rule_id = ?', [ruleId]);
      if (!row) throw new Error('tracked source was not imported');
      return { nodeId: row.last_node_id as string, file };
    });
  }, ORIGINAL);
}

async function openSource(page: DesktopSession['firstWindow'], body: string) {
  await page.getByRole('treeitem', { name: 'Home', exact: true }).click();
  await page.getByRole('treeitem', { name: TITLE, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleDebug!.getEditorContent('prompt-editor'))).toBe(body);
}

test('saves an edit of a reimported body and restores it after a native restart', async ({
  desktopSession, desktopApp, desktopWindow: page
}, testInfo) => {
  let reopened: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await expectWorkspaceShell(page);
    const source = await prepareSource(desktopApp);
    await page.reload();
    await expectWorkspaceShell(page);
    await openSource(page, ORIGINAL);
    await page.getByRole('treeitem', { name: 'Home', exact: true }).click();
    await fs.writeFile(source.file, UPDATED);
    const result = await page.evaluate(nodeId => window.electronAPI.invoke(
      'dev_reimport_current_topic_source', { node_id: nodeId }), source.nodeId);
    expect(result).toMatchObject({ status: 'reimported', node_id: source.nodeId });
    await page.reload();
    await expectWorkspaceShell(page);
    await openSource(page, UPDATED);
    const editor = page.locator('.prompt-editor-host .cm-content');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(APPEND);
    const expected = `${UPDATED}${APPEND}`;
    await expect.poll(() => page.evaluate(() => window.__folioleDebug!.getEditorContent('prompt-editor'))).toBe(expected);
    await page.getByRole('treeitem', { name: 'Home', exact: true }).click();
    await expect.poll(async () => (await loadNodeDocument(page, source.nodeId))?.content).toBe(expected);
    const before = await loadNodeDocument(page, source.nodeId);
    const stateRoot = desktopSession.target.runtimeStateRoot;
    const oldPid = desktopApp.process()?.pid;
    await desktopApp.close();
    reopened = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } });
    expect(reopened.electronApp.process()?.pid).not.toBe(oldPid);
    await expectWorkspaceShell(reopened.firstWindow);
    await openSource(reopened.firstWindow, expected);
    expect(await loadNodeDocument(reopened.firstWindow, source.nodeId)).toEqual(before);
    expect(await fs.readFile(source.file, 'utf8')).toBe(UPDATED);
    await testInfo.attach('reimported-edit-after-native-restart', {
      contentType: 'image/png', body: await reopened.firstWindow.screenshot()
    });
  } finally { await reopened?.close(); }
});
