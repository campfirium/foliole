import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings';
import { resolveDesktopLaunchTarget } from '../../scripts/desktop/playwright-desktop-launch-target.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type RelayClock = typeof window & { relayTick?: () => void };
const body = '\ufeff## Metadata\r\n- Author: [[Ada]]\r\n\r\n## Full Document\r\nBefore exact quote after.\r\n';

async function installClock(page: Page) {
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (handler, delay, ...args) => {
      if (typeof handler === 'function' && delay === 3_600_000) {
        (window as RelayClock).relayTick = handler as () => void;
        return 10_000_000;
      }
      return original(handler, delay, ...args);
    };
  });
}

async function writeArticle(root: string, name: string) {
  const primary = path.join(root, 'Full Document Contents', 'Articles');
  const highlights = path.join(root, 'Articles');
  await mkdir(primary, { recursive: true });
  await mkdir(highlights, { recursive: true });
  await writeFile(path.join(primary, `${name}.md`), body);
  await writeFile(path.join(highlights, `${name}.md`), `# ${name}\n\n## Highlights\nexact quote\n`);
}

async function saveSettings(app: ElectronApplication, root: string) {
  const settings = createDefaultImportManagerSettings();
  settings.readwiseRootPath = root;
  settings.readwiseReaderConfig = { ...settings.readwiseReaderConfig,
    enabled: true, importScope: 'all', validatedAt: new Date().toISOString() };
  settings.readwiseSources = [{ id: 'native-relay', kind: 'articles', keepState: 'enabled',
    primaryPath: path.join(root, 'Full Document Contents', 'Articles'),
    highlightPath: path.join(root, 'Articles'), highlightMode: 'split', keepPreview: null }];
  await app.evaluate(async (_electron, next) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    await connection.runWithDatabaseConnectionOwner(() => {
      require(`${process.cwd()}/dist/electron/database/readwiseHostAssignment.js`).activateReadwiseOnThisHost();
      require(`${process.cwd()}/dist/electron/import/importManagerSettings.js`).saveImportManagerSettings(next);
    });
  }, settings);
}

async function secondWindow(app: ElectronApplication, first: Page) {
  const id = await (await app.browserWindow(first)).evaluate(window => window.id);
  const preloadPath = resolveDesktopLaunchTarget(process.cwd()).preloadPath;
  if (!preloadPath) throw new Error('Missing native preload.');
  const [page] = await Promise.all([app.waitForEvent('window'), app.evaluate(({ BrowserWindow }, input) => {
    const first = BrowserWindow.fromId(input.id)!;
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const options = require(`${process.cwd()}/dist/electron/runtimeMainSupport.js`).createMainWindowOptions(input.preloadPath);
    const next = new BrowserWindow({ ...options,
      webPreferences: { ...options.webPreferences, session: first.webContents.session } });
    void next.loadURL(first.webContents.getURL());
  }, { id, preloadPath })]);
  return page;
}

async function observeReads(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const state = globalThis as typeof globalThis & { relayReads: { full: number; scoped: number; runs: number } };
    state.relayReads = { full: 0, scoped: 0, runs: 0 };
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', (event, request) => {
      if (request.command === 'load_workspace_list_snapshot') state.relayReads.full++;
      if (request.command === 'load_workspace_list_projection') state.relayReads.scoped++;
      if (request.command === 'run_readwise_reader_import') state.relayReads.runs++;
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });
}

async function tick(page: Page) {
  await page.waitForFunction(() => typeof (window as RelayClock).relayTick === 'function');
  await page.evaluate(() => (window as RelayClock).relayTick?.());
}

async function selectArticle(page: Page, name: string) {
  await page.getByRole('treeitem', { name: /^(Inbox|收件箱)$/ }).click();
  await page.getByRole('treeitem', { name, exact: true }).click();
  await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Before exact quote after.');
}

test('scheduled relay imports refresh both native windows without unrelated list reads', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const root = testInfo.outputPath('relay-source');
  await writeArticle(root, 'Relay One');
  await saveSettings(desktopApp, root);
  await installClock(desktopWindow);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.getByRole('treeitem', { name: /^(Inbox|收件箱)$/ }).click();
  await tick(desktopWindow);
  await expect(desktopWindow.getByRole('treeitem', { name: 'Relay One', exact: true })).toBeVisible();
  const receiver = await secondWindow(desktopApp, desktopWindow);
  try {
    await expectWorkspaceShell(receiver);
    expect(await receiver.evaluate(() => typeof window.electronAPI?.invoke)).toBe('function');
    await selectArticle(desktopWindow, 'Relay One');
    await selectArticle(receiver, 'Relay One');
    await observeReads(desktopApp);
    await writeArticle(root, 'Relay Two');
    await tick(desktopWindow);
    for (const page of [desktopWindow, receiver]) {
      await expect(page.getByRole('treeitem', { name: 'Relay Two', exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('treeitem', { name: 'Relay One', selected: true, exact: true })).toBeVisible();
      await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Before exact quote after.');
    }
    const reads = await desktopApp.evaluate(() =>
      (globalThis as typeof globalThis & { relayReads: { full: number; scoped: number; runs: number } }).relayReads);
    expect(reads).toMatchObject({ full: 0, runs: 1 });
    expect(reads.scoped).toBeGreaterThanOrEqual(2);
    expect(await readFile(path.join(root, 'Full Document Contents', 'Articles', 'Relay Two.md'), 'utf8')).toBe(body);
    for (const page of [desktopWindow, receiver]) {
      await selectArticle(page, 'Relay Two');
      await page.reload();
      await expectWorkspaceShell(page);
      await selectArticle(page, 'Relay Two');
    }
    const screenshot = path.resolve('.tmp/artifacts/T627/relay-background-two-windows.png');
    await mkdir(path.dirname(screenshot), { recursive: true });
    await receiver.screenshot({ path: screenshot });
    await testInfo.attach('relay-background-workspace', { path: screenshot });
  } finally {
    await receiver.close();
  }
});
