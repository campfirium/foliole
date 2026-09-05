import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const SCREENSHOT_PATH = path.resolve(
  '.tmp/artifacts/desktop-acceptance/settings-immersive-double-click-edit.png'
);
const READING_TOPIC_ID = 'playwright-immersive-double-click-setting';

test('persists the immersive reading double-click edit preference', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'zh-Hans');
    window.localStorage.removeItem('foliole-immersive-double-click-edit-enabled');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  let dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { exact: true, name: '编辑器' }).click();
  const toggle = dialog.getByRole('switch', { name: '双击正文进入编辑' });
  await expect(dialog.getByText('阅读模式', { exact: true })).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { exact: true, name: '编辑器' }).click();
  const persistedToggle = dialog.getByRole('switch', { name: '双击正文进入编辑' });
  await expect(persistedToggle).toHaveAttribute('aria-checked', 'false');
  await persistedToggle.scrollIntoViewIfNeeded();

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const screenshot = await dialog.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-immersive-double-click-edit', {
    body: screenshot,
    contentType: 'image/png'
  });

  await desktopWindow.keyboard.press('Escape');
  await desktopWindow.evaluate(async (nodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content: 'Double-click selection stays in reading mode.', id: nodeId, kind: 'topic', title: 'Reading mode' }]);
    await api?.openNode?.(nodeId);
  }, READING_TOPIC_ID);
  const editor = desktopWindow.locator('.prompt-editor-host');
  await expect(editor).toContainText('Double-click selection stays in reading mode.');
  await desktopWindow.keyboard.press('F11');
  await expect(editor).toHaveAttribute('data-immersive-editing', 'false');

  await editor.locator('.cm-line').filter({ hasText: 'Double-click selection' }).first().dblclick();
  await expect(editor).toHaveAttribute('data-immersive-editing', 'false');

  await desktopWindow.keyboard.press('Enter');
  await expect(editor).toHaveAttribute('data-immersive-editing', 'true');
});
