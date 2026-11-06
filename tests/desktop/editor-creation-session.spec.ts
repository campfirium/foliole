import { mkdirSync } from 'node:fs';

import { openEditingSession } from './editorContentEditing.test-support';
import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function creationReceipt(session: DesktopSession, release = false) {
  return session.electronApp.evaluate((_, release) => {
    const state = Reflect.get(globalThis, 'creationReceipt');
    if (release) state.release();
    return { ready: state.ready, nodeId: state.nodeId };
  }, release) as Promise<{ ready: boolean; nodeId: string }>;
}

async function creationFacts(session: DesktopSession, nodeId: string) {
  return session.electronApp.evaluate(async (_, nodeId) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite, dbPath } = connection.openDatabaseConnection();
      if (!dbPath.includes('foliole-playwright')) throw new Error('isolated_library_required');
      const { createBetterSqliteDbPort } = require(`${process.cwd()}/dist/electron/database/betterSqliteDbPort.js`);
      const { hasContentEditingSession } = require(`${process.cwd()}/dist/lib/core/sync/contentEditingSession.js`);
      return { editing: hasContentEditingSession(createBetterSqliteDbPort(sqlite), nodeId),
        content: sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId) };
    });
  }, nodeId) as Promise<{ editing: boolean; content: string }>;
}

for (const kind of ['plain', 'code']) {
  test(`finishes a new ${kind} topic after exiting before its creation receipt`, async ({ desktopWindow: page, desktopSession: session }) => {
    const { window: appWindow } = await openEditingSession(session, page);
    await session.electronApp.evaluate(({ ipcMain }) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const commands = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
      const original = commands.handleInvokeRequest;
      const { IPC_INVOKE_CHANNEL: channel } = require(`${process.cwd()}/dist/electron/ipc/contracts.js`);
      const invoke = (event: Electron.IpcMainInvokeEvent, request: Parameters<typeof original>[0]) =>
        original(request, { sender: event.sender });
      const state = { ready: false, nodeId: '', release: () => undefined as void,
        restore: () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, invoke); } };
      const gate = new Promise<void>(resolve => { state.release = resolve; });
      Object.assign(globalThis, { creationReceipt: state });
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async (event, request) => {
        const result = await invoke(event, request);
        if (request.command === 'create_topic') {
          state.nodeId = request.args.nodeId;
          state.ready = true;
          await gate;
        }
        return result;
      });
    });
    try {
      await page.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
      await expect.poll(() => creationReceipt(session)).toMatchObject({ ready: true });
      const { nodeId } = await creationReceipt(session);
      const editor = page.locator('.prompt-editor-host .cm-content');
      await expect(editor).toBeEditable();
      await editor.click();
      const content = kind === 'code' ? '```js\nconst value = 1;\n```\n尾部 中😀' : 'New topic tail 中😀';
      await page.keyboard.insertText(content);
      await expect(editor).toBeFocused();
      await expect.poll(() => creationFacts(session, nodeId)).toMatchObject({ editing: true, content: '' });
      await page.keyboard.press('Escape');
      await expect(editor).not.toBeFocused();
      expect((await creationFacts(session, nodeId)).editing).toBe(true);
      await creationReceipt(session, true);
      await expect.poll(() => creationFacts(session, nodeId)).toEqual({ editing: false, content });
      expect(await appWindow.evaluate(window => window.isFocused())).toBe(true);
      await expect(editor).not.toBeFocused();
      await page.reload();
      await expectWorkspaceShell(page);
      expect(await creationFacts(session, nodeId)).toEqual({ editing: false, content });
      await page.evaluate(nodeId => window.__folioleWorkspaceDebug?.openNode(nodeId), nodeId);
      await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(content);
      mkdirSync('.tmp/artifacts/T727', { recursive: true });
      await page.screenshot({ path: `.tmp/artifacts/T727/creation-session-${kind}.png` });
    } finally {
      await session.electronApp.evaluate(() => {
        const state = Reflect.get(globalThis, 'creationReceipt');
        state.release(); state.restore();
      });
    }
  });
}
