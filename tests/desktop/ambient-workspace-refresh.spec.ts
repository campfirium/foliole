import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seed(page: Page) {
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'ambient-topic', kind: 'topic', title: 'Ambient article', content: 'Original ambient paragraph' },
      { id: 'ambient-other', kind: 'topic', title: 'Unrelated article', content: 'Unrelated paragraph' }
    ], { persist: true });
  });
}

async function createReceiver(app: ElectronApplication, origin: Page, preloadPath: string) {
  const originId = await (await app.browserWindow(origin)).evaluate(window => window.id);
  const nextWindow = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }, input) => {
    const first = BrowserWindow.fromId(input.id)!;
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { createMainWindowOptions } = require(`${process.cwd()}/dist/electron/runtimeMainSupport.js`);
    const options = createMainWindowOptions(input.preloadPath);
    const second = new BrowserWindow({ ...options, webPreferences: { ...options.webPreferences, session: first.webContents.session } });
    void second.loadURL(first.webContents.getURL());
  }, { id: originId, preloadPath });
  return nextWindow;
}

test('ordinary editing refreshes a second renderer locally and survives both reloads', async ({ desktopApp, desktopWindow: origin, desktopSession }, testInfo) => {
  await expectWorkspaceShell(origin);
  await seed(origin);
  await origin.reload();
  await expectWorkspaceShell(origin);
  const receiver = await createReceiver(desktopApp, origin, desktopSession.target.preloadPath!);
  try {
    await expectWorkspaceShell(receiver);
    const health = await receiver.evaluate(async () => ({ url: location.href,
      debug: window.electronAPI?.debug, api: Object.keys(window.electronAPI ?? {}),
      snapshot: await window.electronAPI?.invoke('load_workspace_list_snapshot'), text: document.body.innerText.slice(0, 3000) }));
    await testInfo.attach('receiver-health', { body: JSON.stringify(health), contentType: 'application/json' });
    for (const page of [origin, receiver]) {
      await page.locator('[data-node-id="ambient-topic"]').first().click();
      await expect(page.locator('.prompt-editor-host .cm-content')).toContainText('Original ambient paragraph');
    }
    const receiverId = await (await desktopApp.browserWindow(receiver)).evaluate(window => window.webContents.id);
    await desktopApp.evaluate(({ ipcMain }, id) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
      const state = globalThis as typeof globalThis & { ambientReads?: { full: number; scoped: number } };
      state.ambientReads = { full: 0, scoped: 0 };
      ipcMain.removeHandler('foliole:invoke');
      ipcMain.handle('foliole:invoke', (event, request) => {
        if (event.sender.id === id) {
          if (request.command === 'load_workspace_list_snapshot') state.ambientReads!.full++;
          if (request.command === 'load_workspace_list_projection') state.ambientReads!.scoped++;
        }
        return handleInvokeRequest(request, { sender: event.sender });
      });
    }, receiverId);
    await origin.locator('.prompt-editor-host .cm-content').click();
    await origin.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await origin.keyboard.insertText('Changed ambient paragraph');
    await expect.poll(() => origin.evaluate(async () =>
      (await window.electronAPI.invoke('load_node_document', { nodeId: 'ambient-topic' }))?.content
    )).toBe('Changed ambient paragraph');
    await expect(receiver.locator('.prompt-editor-host .cm-content')).toHaveText('Changed ambient paragraph');
    const reads = await desktopApp.evaluate(() =>
      (globalThis as typeof globalThis & { ambientReads?: { full: number; scoped: number } }).ambientReads);
    expect(reads?.full).toBe(0);
    expect(reads!.scoped).toBeGreaterThan(0);
    for (const page of [origin, receiver]) {
      await expect(page.locator('.prompt-editor-host .cm-content')).toHaveText('Changed ambient paragraph');
      await page.reload();
      await expectWorkspaceShell(page);
      await page.locator('[data-node-id="ambient-topic"]').first().click();
      await expect(page.locator('.prompt-editor-host .cm-content')).toHaveText('Changed ambient paragraph');
      await expect(page.locator('[data-node-id="ambient-other"]').first()).toContainText('Unrelated article');
    }
    const screenshot = path.resolve('.tmp/artifacts/T625/ambient-two-windows.png');
    await fs.mkdir(path.dirname(screenshot), { recursive: true });
    await receiver.screenshot({ path: screenshot });
    await testInfo.attach('ambient-two-windows', { path: screenshot });
  } finally { await receiver.close(); }
});
