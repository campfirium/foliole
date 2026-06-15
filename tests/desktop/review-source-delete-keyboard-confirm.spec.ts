import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_TOPIC_ID = 'keyboard-delete-source-topic';

async function seedSourceTopic(page: import('@playwright/test').Page) {
  await page.evaluate(async (nodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.seedNodes([
      {
        content: 'Source topic body for keyboard delete confirmation.',
        id: nodeId,
        kind: 'topic',
        title: 'Keyboard Delete Source Topic'
      }
    ], { persist: false });
  }, SOURCE_TOPIC_ID);
}

async function getSourceTopicTrashed(page: import('@playwright/test').Page) {
  return page.evaluate((nodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode(nodeId)?.trashed ?? null,
  SOURCE_TOPIC_ID);
}

async function enterFlow(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('[aria-label="Enter Flow"], [aria-label="进入 Flow"]')?.click();
  });
  await expect(page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ })).toBeVisible();
}

async function dispatchWindowKey(page: import('@playwright/test').Page, init: KeyboardEventInit) {
  await page.evaluate((eventInit) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...eventInit }));
  }, init);
}

test('review source topic delete dialog confirms with delete keys in hidden desktop runtime', async ({
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  await seedSourceTopic(desktopWindow);

  await enterFlow(desktopWindow);
  await dispatchWindowKey(desktopWindow, { altKey: true, code: 'KeyT', key: 't' });
  const dialog = desktopWindow.getByRole('dialog', { name: /^(Delete source topic\?|删除来源主题？)$/ });
  await expect(dialog).toBeVisible();

  await dialog.dispatchEvent('keydown', { bubbles: true, cancelable: true, code: 'KeyF', key: 'f' });
  await dialog.dispatchEvent('keydown', { bubbles: true, cancelable: true, code: 'Enter', key: 'Enter' });
  expect(await getSourceTopicTrashed(desktopWindow)).toBe(false);
  await expect(dialog).toBeVisible();

  await dialog.dispatchEvent('keydown', { bubbles: true, cancelable: true, code: 'KeyT', key: 't' });

  await expect.poll(() => getSourceTopicTrashed(desktopWindow)).toBe(true);
});
