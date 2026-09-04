import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const TOPIC_ID = 'playwright-t174-menu-arbitration';

async function prepareEditor(page: Page) {
  await page.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.setItem('foliole-mouse-gestures-enabled', 'true');
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  await page.evaluate(async (nodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: 'Gesture menu target', id: nodeId, kind: 'topic', title: 'Gesture Menu Target' }
    ]);
    await api?.openNode?.(nodeId);
  }, TOPIC_ID);
  await expect.poll(
    () => page.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.())
  ).toBe(TOPIC_ID);
  await page.evaluate(() => globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 7));
}

async function editorPoint(page: Page) {
  const content = page.locator('.prompt-editor-host .cm-content');
  await expect(content).toBeVisible();
  const box = await content.boundingBox();
  if (!box) throw new Error('editor content has no bounding box');
  return { x: box.x + Math.min(160, box.width / 2), y: box.y + 24 };
}

test('arbitrates normal right click and unbound gesture as exclusive outcomes', async ({
  desktopWindow
}, testInfo) => {
  await prepareEditor(desktopWindow);
  const menu = desktopWindow.getByRole('menu');
  const point = await editorPoint(desktopWindow);

  await desktopWindow.mouse.move(point.x, point.y);
  await desktopWindow.mouse.down({ button: 'right' });
  await expect(menu).toBeHidden();
  await desktopWindow.mouse.up({ button: 'right' });
  await expect(menu).toBeVisible();
  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/t174-2-normal-context-menu.png');
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('normal-context-menu-after-release', { path: screenshotPath });
  await desktopWindow.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await desktopWindow.mouse.move(point.x, point.y);
  await desktopWindow.mouse.down({ button: 'right' });
  await desktopWindow.mouse.move(point.x, point.y - 80, { steps: 4 });
  await desktopWindow.mouse.up({ button: 'right' });
  await expect(menu).toBeHidden();
});
