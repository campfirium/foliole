import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = path.resolve('.tmp/artifacts/T732-2/native');
const sourceId = 'backlinks-source';
const targetId = 'backlinks-target';

async function secondRenderer(app: ElectronApplication, origin: Page, preloadPath: string) {
  const id = await (await app.browserWindow(origin)).evaluate(window => window.id);
  const pending = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }, input) => {
    const first = BrowserWindow.fromId(input.id)!;
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { createMainWindowOptions } = require(`${process.cwd()}/dist/electron/runtimeMainSupport.js`);
    const options = createMainWindowOptions(input.preloadPath);
    const second = new BrowserWindow({ ...options, show: false,
      webPreferences: { ...options.webPreferences, session: first.webContents.session } });
    void second.loadURL(first.webContents.getURL());
  }, { id, preloadPath });
  const page = await pending;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expectWorkspaceShell(page);
  return page;
}

async function showBacklinks(page: Page) {
  const direct = page.locator('.window-titlebar button[data-panel-id="backlinks"]');
  if (await direct.isVisible()) await direct.click();
  else {
    await page.getByRole('button', { name: 'More right sidebar panels', exact: true }).click();
    await page.getByRole('menuitem', { name: /Backlinks/ }).click();
  }
  await expect(page.locator('[data-panel-content-root="backlinks"]')).toBeVisible();
}

async function replaceSource(page: Page, content: string) {
  const editor = page.getByRole('textbox', { name: 'Prompt editor', exact: true });
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(content);
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).focus();
  await expect.poll(() => page.evaluate(async nodeId =>
    (await window.electronAPI.invoke('load_node_document', { nodeId }))?.content, sourceId)).toBe(content);
}

async function persisted(page: Page) {
  return page.evaluate(async nodeId => ({
    document: await window.electronAPI.invoke('load_node_document', { nodeId }),
    backlinks: await window.electronAPI.invoke('load_node_backlinks', { node_id: 'backlinks-target' })
  }), sourceId);
}

test('refreshes backlinks continuously across real source edits, renames and trash transitions', async ({ desktopApp, desktopSession, desktopWindow: target }) => {
  await expectWorkspaceShell(target);
  await target.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await target.reload();
  await expectWorkspaceShell(target);
  await target.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug!;
    await api.seedNodes([
      { id: 'backlinks-target', kind: 'topic', title: 'Backlink Target', content: '# Backlink Target\n\nTarget body.' },
      { id: 'backlinks-source', kind: 'topic', title: 'Backlink Source', content: '# Backlink Source\n\nInitial [[Backlink Target]].' }
    ], { persist: true });
    await api.openNode('backlinks-target');
  });
  await showBacklinks(target);
  const panel = target.locator('[data-panel-content-root="backlinks"]');
  await expect(panel.getByRole('button', { name: /Backlink Source/ })).toBeVisible();
  const source = await secondRenderer(desktopApp, target, desktopSession.target.preloadPath!);
  fs.mkdirSync(output, { recursive: true });
  const results: Record<string, unknown> = {};
  try {
    await source.evaluate(() => window.__folioleWorkspaceDebug!.openNode('backlinks-source'));
    await expect(source.getByRole('textbox', { name: 'Prompt editor', exact: true })).toContainText('Initial');
    await replaceSource(source, '# Backlink Source\n\nRemoved link.');
    await expect(panel.getByRole('button')).toHaveCount(0);
    results.removed = await persisted(target);
    await replaceSource(source, '# Backlink Source\n\nNew [[Backlink Target]] and [[Backlink Target]].');
    await expect(panel).toContainText('Found 1 topics');
    await expect(panel.getByRole('button', { name: /New.*2/s })).toBeVisible();
    await source.evaluate(() => window.__folioleWorkspaceDebug!.updateNodeTitle('backlinks-source', 'Renamed Source'));
    await expect(panel.getByRole('button', { name: /Renamed Source.*New/s })).toBeVisible();
    results.renamed = await persisted(target);
    await source.evaluate(() => window.__folioleWorkspaceDebug!.deleteNode('backlinks-source'));
    await expect(panel.getByRole('button')).toHaveCount(0);
    results.deleted = await persisted(target);
    await source.evaluate(() => window.__folioleWorkspaceDebug!.restoreNode('backlinks-source'));
    await expect(panel.getByRole('button', { name: /Renamed Source/ })).toBeVisible();
    results.restored = await persisted(target);
    await target.evaluate(() => window.__folioleWorkspaceDebug!.updateNodeTitle('backlinks-target', 'Renamed Target'));
    await expect(panel.getByRole('button')).toHaveCount(0);
    await source.evaluate(() => window.__folioleWorkspaceDebug!.openNode('backlinks-source'));
    await replaceSource(source, '# Renamed Source\n\nMatches [[Renamed Target]].');
    await expect(panel.getByRole('button', { name: /Renamed Source.*Matches/s })).toBeVisible();
    results.final = await persisted(target);
    expect(await persisted(source)).toEqual(results.final);
    expect(await target.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBe(targetId);
    await target.screenshot({ path: path.join(output, 'updated-backlinks.png') });
    await panel.getByRole('button', { name: /Renamed Source/ }).click();
    await expect.poll(() => target.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBe(sourceId);
    await expect(target.getByRole('textbox', { name: 'Prompt editor', exact: true })).toContainText('Matches');
    for (const page of [target, source]) {
      await page.reload();
      await expectWorkspaceShell(page);
      expect(await persisted(page)).toEqual(results.final);
    }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2));
  } finally { await source.close(); }
});
