import fs from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { facts, openEditingSession } from './editorContentEditing.test-support';
import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

async function editAgainAfterSettings(page: Page, session: DesktopSession, editor: Locator, expected: string) {
  await editor.click();
  await page.evaluate(length => window.__folioleDebug?.setEditorSelection?.('prompt-editor', length, length), expected.length);
  await page.keyboard.insertText('\nNew editing after settings');
  const continued = expected + '\nNew editing after settings';
  await expect.poll(() => facts(session)).toMatchObject({ content: continued, editing: true });
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await facts(session)).editing).toBe(false);
  return continued;
}

async function selectLibraryDirectory(session: DesktopSession, target: string) {
  await session.electronApp.evaluate(({ dialog }, target) => {
    const original = dialog.showOpenDialog;
    Object.assign(globalThis, { restoreLibrarySwitchDialog: () => { dialog.showOpenDialog = original; } });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, target);
}

test('saves editing before changing the library location through Storage settings', async ({ desktopWindow: page, desktopSession: session }) => {
  await fs.mkdir('.tmp/artifacts/T727', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.tmp/artifacts/T727/foliole-playwright-library-switch-'));
  const target = path.join(root, 'Next');
  await fs.mkdir(target);
  const original = await page.evaluate(() => window.electronAPI.invoke('load_library_path_settings', {})) as {
    library_home: string; database_path: string
  };
  try {
    const { editor } = await openEditingSession(session, page);
    await editor.click();
    await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
    await page.keyboard.insertText('Tail 中😀\n\n```js\nconst value = 1;\n```\n');
    const expected = 'Tail 中😀\n\n```js\nconst value = 1;\n```\nBase';
    await expect.poll(() => facts(session)).toMatchObject({ content: expected, editing: true });
    await page.evaluate(() => {
      const original = window.__folioleFlushPendingEditorDraftBeforeClose!;
      const state = { called: false, release: () => undefined as void };
      const gate = new Promise<void>(resolve => { state.release = resolve; });
      Object.assign(window, { librarySwitchFlush: state });
      window.__folioleFlushPendingEditorDraftBeforeClose = async () => {
        state.called = true;
        await gate;
        return original();
      };
    });
    await selectLibraryDirectory(session, target);
    const settings = await openSettingsDialog(page);
    await expect.poll(async () => (await facts(session)).editing).toBe(false);
    await settings.getByRole('button', { name: /^(Storage|存储)$/ }).click();
    await settings.locator('[data-settings-search-row-id="library-home"]').getByRole('button', { name: /Change location|更改位置/ }).click();
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { librarySwitchFlush: { called: boolean } }).librarySwitchFlush.called)).toBe(true);
    expect(await page.evaluate(() => window.electronAPI.invoke('load_library_path_settings', {})))
      .toMatchObject({ database_path: original.database_path });
    await page.evaluate(() => (window as unknown as { librarySwitchFlush: { release: () => void } }).librarySwitchFlush.release());
    await expect.poll(() => page.evaluate(() => window.electronAPI.invoke('load_library_path_settings', {})))
      .toMatchObject({ library_home: target });
    expect((await facts(session)).content).toBe(expected);
    await page.keyboard.press('Escape');
    await expect(settings).not.toBeVisible();
    expect((await facts(session)).editing).toBe(false);
    const continued = await editAgainAfterSettings(page, session, editor, expected);
    await page.screenshot({ path: '.tmp/artifacts/T727/library-switch-saved-tail.png' });
    await page.reload();
    await expectWorkspaceShell(page);
    expect((await facts(session)).content).toBe(continued);
  } finally {
    await session.electronApp.evaluate(() => {
      (globalThis as unknown as { restoreLibrarySwitchDialog?: () => void }).restoreLibrarySwitchDialog?.();
    });
    await page.evaluate(original => window.electronAPI.invoke('update_library_path_setting', {
      location: 'library_home', path: original, confirm_existing_library_home: true
    }), original.library_home);
    await fs.rm(root, { recursive: true, force: true });
  }
});
