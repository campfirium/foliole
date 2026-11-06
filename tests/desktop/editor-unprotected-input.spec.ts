import { mkdirSync } from 'node:fs';

import { facts, openEditingSession } from './editorContentEditing.test-support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('edits, receives, saves and reopens without requesting ordinary collection protection', async ({ desktopWindow: page, desktopSession: session }) => {
  await session.electronApp.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const { IPC_INVOKE_CHANNEL: channel } = require(`${process.cwd()}/dist/electron/ipc/contracts.js`);
    const invoke = (event: Electron.IpcMainInvokeEvent, request: Parameters<typeof handleInvokeRequest>[0]) =>
      handleInvokeRequest(request, { sender: event.sender });
    const state = { requests: 0, release: () => undefined as void,
      restore: () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, invoke); } };
    const gate = new Promise<void>(resolve => { state.release = resolve; });
    Object.assign(globalThis, { editorCollectionProtection: state });
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, request) => {
      if (request.command === 'retain_node_editor_base') { state.requests += 1; await gate; }
      return invoke(event, request);
    });
  });
  try {
    const { editor, base } = await openEditingSession(session, page);
    await editor.click();
    await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
    await page.keyboard.insertText('Local ');
    await expect.poll(() => facts(session)).toMatchObject({ content: 'Local Base', editing: true });
    await facts(session, true, base.versionId);
    await expect(editor).toBeFocused();
    await expect(editor).toBeEditable();
    await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
    await page.keyboard.insertText('Tail 中😀 ');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await facts(session)).parents).toHaveLength(2);
    const settled = await facts(session);
    expect(settled.editing).toBe(false);
    expect(new Set([settled.content, ...settled.alternatives])).toEqual(new Set(['Tail 中😀 Local Base', 'Remote branch']));
    expect(await session.electronApp.evaluate(() => Reflect.get(globalThis, 'editorCollectionProtection').requests)).toBe(0);
    await page.reload();
    await expectWorkspaceShell(page);
    expect(await facts(session)).toEqual(settled);
    mkdirSync('.tmp/artifacts/T727', { recursive: true });
    await page.screenshot({ path: '.tmp/artifacts/T727/unprotected-editor-reopened.png' });
  } finally {
    await session.electronApp.evaluate(() => {
      const state = Reflect.get(globalThis, 'editorCollectionProtection');
      state.release(); state.restore();
    });
  }
});
