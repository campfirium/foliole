import path from 'node:path';
import process from 'node:process';

import type { ElectronApplication } from '@playwright/test';

import {
  collectActiveEditorState,
  collectNode,
  CONTEXT_A_CONTENT,
  CONTEXT_A_ID,
  focusEditor,
  insertEditorText,
  seedContextualHistoryWorkspace
} from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EDIT_TEXT = '\nConfigured redo';
const EVIDENCE_PATH = path.resolve(
  '.tmp/artifacts/desktop-acceptance/macos-redo-shortcut-settings.png'
);

async function sendRecordedShortcut(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())?.webContents.send(
      'foliole:native-keyboard-input',
      {
        altKey: true,
        code: 'KeyY',
        controlKey: false,
        key: 'y',
        metaKey: true,
        shiftKey: false,
        type: 'keyDown'
      }
    );
  });
}

function readRedoMenu(electronApp: ElectronApplication) {
  return electronApp.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('app.redo');
    return { accelerator: item?.accelerator ?? null, enabled: item?.enabled };
  });
}

test('keeps redo settings and the focused editor on one configurable command route', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  // SKIP: macOS-only shortcut acceptance | 2026-08-14 | revive: add the Windows shortcut matrix to native acceptance
  test.skip(process.platform !== 'darwin', 'macOS is the declared acceptance host');
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.removeItem('foliole-command-shortcut-overrides');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await seedContextualHistoryWorkspace(desktopWindow);

  await insertEditorText(desktopWindow, EDIT_TEXT);
  const highlightId = await desktopWindow.evaluate(async (parentNodeId) => (
    window.__folioleWorkspaceDebug?.createTextHighlightChild?.({
      anchorId: 'redo-shortcut-route-highlight',
      parentNodeId,
      text: 'Redo shortcut route highlight'
    }) ?? null
  ), CONTEXT_A_ID);
  expect(highlightId).toBeTruthy();
  await desktopWindow.keyboard.press('Meta+Z');
  await desktopWindow.keyboard.press('Meta+Z');
  await expect.poll(() => collectActiveEditorState(desktopWindow, CONTEXT_A_ID)).toMatchObject({
    editorContent: CONTEXT_A_CONTENT,
    nodeContent: CONTEXT_A_CONTENT
  });
  await expect.poll(() => collectNode(desktopWindow, highlightId!)).toMatchObject({ trashed: true });

  const settingsDialog = await openSettingsCategory(desktopWindow, 'Hotkeys');
  await settingsDialog.getByRole('searchbox', { name: 'Search hotkeys' }).fill('Redo');
  const redoShortcut = settingsDialog.getByRole('button', { name: /^Shortcut for Redo/ });
  await expect(redoShortcut).toHaveText('⇧ ⌘ Z');
  await expect.poll(() => readRedoMenu(desktopSession.electronApp)).toMatchObject({ accelerator: 'Command+Shift+Z' });
  await expect(settingsDialog.getByRole('button', { name: /^Secondary shortcut for Redo/ })).toHaveCount(0);
  await redoShortcut.click();
  await sendRecordedShortcut(desktopSession.electronApp);
  await expect(redoShortcut).toHaveText('⌥ ⌘ Y');
  await settingsDialog.screenshot({ path: EVIDENCE_PATH });
  await testInfo.attach('macos-redo-shortcut-settings', { path: EVIDENCE_PATH });

  await expect.poll(() => readRedoMenu(desktopSession.electronApp)).toMatchObject({ accelerator: 'Command+Alt+Y' });
  await desktopWindow.keyboard.press('Escape');
  await focusEditor(desktopWindow);

  await desktopWindow.keyboard.press('Meta+Shift+Z');
  await expect.poll(() => collectActiveEditorState(desktopWindow, CONTEXT_A_ID)).toMatchObject({
    editorContent: CONTEXT_A_CONTENT,
    nodeContent: CONTEXT_A_CONTENT
  });
  await desktopWindow.keyboard.press('Meta+Alt+Y');
  await expect.poll(() => collectActiveEditorState(desktopWindow, CONTEXT_A_ID)).toMatchObject({
    editorContent: `${CONTEXT_A_CONTENT}${EDIT_TEXT}`,
    nodeContent: `${CONTEXT_A_CONTENT}${EDIT_TEXT}`
  });
  await expect.poll(() => collectNode(desktopWindow, highlightId!)).toMatchObject({ trashed: true });
  await desktopWindow.keyboard.press('Meta+Alt+Y');
  await expect.poll(() => collectNode(desktopWindow, highlightId!)).toMatchObject({ trashed: false });
});

test('clears the native redo shortcut and keeps the Edit menu action available', async ({
  desktopApp, desktopWindow
}) => {
  // SKIP: macOS Edit menu acceptance | 2026-11-14 | revive: cover the Windows Editor menu separately
  test.skip(process.platform !== 'darwin', 'macOS Edit menu');
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-app-language', 'en');
    localStorage.removeItem('foliole-command-shortcut-overrides');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await seedContextualHistoryWorkspace(desktopWindow);

  const beforeCut = CONTEXT_A_CONTENT + '\nRedo cut probe';
  const afterCut = CONTEXT_A_CONTENT + '\n';
  const content = async () => (await collectActiveEditorState(desktopWindow, CONTEXT_A_ID)).nodeContent;
  await insertEditorText(desktopWindow, '\nRedo cut probe');
  await expect.poll(content).toBe(beforeCut);
  expect(await desktopWindow.evaluate((end) => (
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', end, end)
  ), beforeCut.length)).toBe(true);
  await desktopWindow.keyboard.press('Meta+X');
  await expect.poll(content).toBe(afterCut);
  await desktopWindow.keyboard.press('Meta+Z');
  await expect.poll(content).toBe(beforeCut);

  const settings = await openSettingsCategory(desktopWindow, 'Hotkeys');
  await settings.getByRole('searchbox', { name: 'Search hotkeys' }).fill('Redo');
  const clearShortcut = settings.getByRole('button', { name: /^Clear Shortcut for Redo/ });
  await clearShortcut.click();
  await expect(clearShortcut).toHaveCount(0);
  await expect.poll(() => readRedoMenu(desktopApp)).toMatchObject({ accelerator: null });
  await desktopWindow.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await desktopWindow.keyboard.press('Meta+Shift+Z');
  await expect.poll(() => readRedoMenu(desktopApp)).toEqual({ accelerator: null, enabled: true });
  expect(await content()).toBe(beforeCut);

  await desktopApp.evaluate(({ BrowserWindow, Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('app.redo');
    if (!item) throw new Error('Redo menu item missing');
    item.click(item, BrowserWindow.getAllWindows()[0], undefined);
  });
  await expect.poll(content).toBe(afterCut);
});
