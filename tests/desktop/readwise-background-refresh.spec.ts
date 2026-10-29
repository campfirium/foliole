import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { resolveDesktopLaunchTarget } from '../../scripts/desktop/playwright-desktop-launch-target.mjs';

import { expect, test } from './harness/fixtures';
import { connectAndCutoverReadwiseApi, expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import { createT178ApiAcceptanceSession } from './harness/t178ApiAcceptanceSession';

async function installRemote(app: ElectronApplication) {
  await app.evaluate(({ clipboard }) => {
    const state = globalThis as typeof globalThis & { backgroundReadwiseId: string };
    state.backgroundReadwiseId = 'article-one';
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      const id = state.backgroundReadwiseId;
      const category = url.searchParams.get('category');
      const requestedId = url.searchParams.get('id');
      const include = url.pathname === '/api/v3/list/' && (!category || category === 'article')
        && (!requestedId || requestedId === id);
      return Response.json({ nextPageCursor: null, results: include ? [{
        category: 'article', html_content: `<p>Background body ${id}</p>`, id,
        title: `Background ${id}`, updated_at: new Date().toISOString()
      }] : [] });
    };
    clipboard.writeText('isolated-readwise-background-token');
  });
}

async function connect(page: Page) {
  const settings = await openSettingsCategory(page, 'ReadwiseReader');
  await connectAndCutoverReadwiseApi(page, settings, 'inbox');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: 'Background article-one', exact: true })).toBeVisible({ timeout: 60_000 });
}

async function secondWindow(app: ElectronApplication, firstPage: Page) {
  const firstId = await (await app.browserWindow(firstPage)).evaluate(window => window.id);
  const preloadPath = resolveDesktopLaunchTarget(process.cwd()).preloadPath;
  if (!preloadPath) throw new Error('The native launch target has no preload.');
  const [next] = await Promise.all([
    app.waitForEvent('window'),
    app.evaluate(({ BrowserWindow }, input) => {
      const first = BrowserWindow.fromId(input.id)!;
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const { createMainWindowOptions } = require(`${process.cwd()}/dist/electron/runtimeMainSupport.js`);
      const options = createMainWindowOptions(input.preloadPath);
      const window = new BrowserWindow({ ...options,
        webPreferences: { ...options.webPreferences, session: first.webContents.session } });
      void window.loadURL(first.webContents.getURL());
    }, { id: firstId, preloadPath })
  ]);
  return next;
}

async function observeReads(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const state = globalThis as typeof globalThis & { backgroundReads: { full: number; scoped: number } };
    state.backgroundReads = { full: 0, scoped: 0 };
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', (event, request) => {
      if (request.command === 'load_workspace_list_snapshot') state.backgroundReads.full++;
      if (request.command === 'load_workspace_list_projection') state.backgroundReads.scoped++;
      return handleInvokeRequest(request, { sender: event.sender });
    });
  });
}

async function makeNextRunDue(app: ElectronApplication) {
  await app.evaluate(async () => {
    const state = globalThis as typeof globalThis & { backgroundReadwiseId: string };
    state.backgroundReadwiseId = 'article-two';
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const settings = require(`${process.cwd()}/dist/electron/database/settingsStore.js`);
    const scheduler = require(`${process.cwd()}/dist/electron/import/readwiseApiScheduler.js`);
    await connection.runWithDatabaseConnectionOwner(() => {
      const previous = settings.loadJsonSetting('readwise_api_schedule_state');
      // Make the isolated schedule overdue; the production scheduler still owns the import.
      settings.saveJsonSetting('readwise_api_schedule_state', { ...previous,
        lastResult: { completed_at: '2020-01-01T00:00:00.000Z', error_stage: null,
          imported_count: 0, status: 'completed', trigger: 'manual' } });
      scheduler.refreshReadwiseApiScheduler();
    });
  });
}

async function isolatedState(app: ElectronApplication) {
  return app.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const settings = require(`${process.cwd()}/dist/electron/import/importManagerSettings.js`);
    const scheduler = require(`${process.cwd()}/dist/electron/import/readwiseApiScheduler.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const current = settings.loadImportManagerSettings();
      return { status: scheduler.loadReadwiseApiScheduleStatus(),
        policy: current.readwiseAutoImportPolicy, mode: current.readwiseSourceMode,
        nodes: connection.openDatabaseConnection().driver.queryAll(
          "SELECT id,title,parent_id,deleted_at FROM nodes WHERE title LIKE 'Background%'") };
    });
  });
}

test('background API imports refresh both workspaces locally and survive reload', async ({ browserName }, testInfo) => {
  void browserName;
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-background-readwise-'));
  const session = await createT178ApiAcceptanceSession(root);
  let receiver: Page | undefined;
  try {
    await installRemote(session.electronApp);
    const first = session.firstWindow;
    await expectWorkspaceShell(first);
    await connect(first);
    receiver = await secondWindow(session.electronApp, first);
    await expectWorkspaceShell(receiver);
    expect(await receiver.evaluate(() => typeof window.electronAPI?.invoke)).toBe('function');
    for (const page of [first, receiver]) {
      await page.getByRole('treeitem', { name: /^(Inbox|收件箱)$/ }).click();
      await page.getByRole('treeitem', { name: 'Background article-one', exact: true }).click();
      await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Background body article-one');
    }
    await observeReads(session.electronApp);
    await makeNextRunDue(session.electronApp);
    for (const page of [first, receiver]) {
      await expect(page.getByRole('treeitem', { name: 'Background article-two', exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Background body article-one');
    }
    const reads = await session.electronApp.evaluate(() =>
      (globalThis as typeof globalThis & { backgroundReads: { full: number; scoped: number } }).backgroundReads);
    expect(reads.full).toBe(0);
    expect(reads.scoped).toBeGreaterThanOrEqual(2);
    for (const page of [first, receiver]) {
      await page.getByRole('treeitem', { name: 'Background article-two', exact: true }).click();
      await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Background body article-two');
      await page.reload();
      await expectWorkspaceShell(page);
      await page.getByRole('treeitem', { name: /^(Inbox|收件箱)$/ }).click();
      await page.getByRole('treeitem', { name: 'Background article-two', exact: true }).click();
      await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Background body article-two');
    }
    const screenshot = path.resolve('.tmp/artifacts/T627/api-background-two-windows.png');
    await mkdir(path.dirname(screenshot), { recursive: true });
    await receiver.screenshot({ path: screenshot });
    await testInfo.attach('background-workspace', { path: screenshot });
  } catch (error) {
    const diagnostic = path.resolve('.tmp/artifacts/T627/api-native-state.json');
    await mkdir(path.dirname(diagnostic), { recursive: true });
    const windows = [];
    for (const page of [session.firstWindow, ...(receiver ? [receiver] : [])]) {
      windows.push(await page.evaluate(async () => {
        const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot');
        return { url: location.href, libraryScope: snapshot.libraryScope,
          titles: Object.values(snapshot.nodesById).map(node => node.title) };
      }).catch(error => ({ error: String(error) })));
    }
    await writeFile(diagnostic, JSON.stringify({ ...await isolatedState(session.electronApp), windows }, null, 2));
    throw error;
  } finally {
    await receiver?.close();
    await session.close();
    await rm(root, { recursive: true, force: true });
  }
});
