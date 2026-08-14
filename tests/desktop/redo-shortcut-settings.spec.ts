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
  await expect(settingsDialog.getByRole('button', { name: /^Secondary shortcut for Redo/ })).toHaveCount(0);
  await redoShortcut.click();
  await sendRecordedShortcut(desktopSession.electronApp);
  await expect(redoShortcut).toHaveText('⌥ ⌘ Y');
  await settingsDialog.screenshot({ path: EVIDENCE_PATH });
  await testInfo.attach('macos-redo-shortcut-settings', { path: EVIDENCE_PATH });

  await expect.poll(() => desktopSession.electronApp.evaluate(({ Menu }) => (
    Menu.getApplicationMenu()?.getMenuItemById('app.redo')?.accelerator ?? null
  ))).toBe('Command+Alt+Y');
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
