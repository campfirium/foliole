import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = '.tmp/artifacts/desktop-acceptance/selection-toolbar-after-delete.png';
const TOPIC_ID = 'playwright-selection-toolbar-delete';

async function seedEditor(desktopWindow: Page) {
  await desktopWindow.evaluate(async (topicId) => {
    const workspace = globalThis.window?.__folioleWorkspaceDebug;
    await workspace?.seedNodes?.([{
      content: 'Alpha Beta Gamma',
      id: topicId,
      kind: 'topic',
      title: 'Selection Toolbar Delete'
    }]);
    await workspace?.openNode?.(topicId);
  }, TOPIC_ID);
}

test('deleting selected editor text dismisses the annotation toolbar', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedEditor(desktopWindow);
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 6, 10) ?? false
  )).toBe(true);

  await desktopWindow.locator('.prompt-editor-host .cm-content').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: rect.left + 120,
      clientY: rect.top + 20
    }));
  });
  await expect(desktopWindow.locator('[data-annotation-toolbar="true"]')).toBeVisible();

  await desktopWindow.keyboard.press('Backspace');

  await expect(desktopWindow.locator('[data-annotation-toolbar="true"]')).toBeHidden();
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
  )).toBe('Alpha  Gamma');
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
});
