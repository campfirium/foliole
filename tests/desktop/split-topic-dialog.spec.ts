import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_TOPIC_ID = 'playwright-split-topic-source';
const SOURCE_TITLE = 'Playwright Split Topic Source';
const FIRST_TITLE = 'Split Alpha';
const SECOND_TITLE = 'Split Beta';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/split-topic-dialog.png');

async function seedSplitTopic(page: import('@playwright/test').Page) {
  await page.evaluate(async ({ sourceTopicId, sourceTitle }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: '# Split Alpha\n\nAlpha body\n\n---split---\n\n# Split Beta\n\nBeta body',
        id: sourceTopicId,
        kind: 'topic',
        title: sourceTitle
      }
    ]);
    await api?.openNode?.(sourceTopicId);
  }, { sourceTitle: SOURCE_TITLE, sourceTopicId: SOURCE_TOPIC_ID });
}

async function openSplitTopicDialog(page: import('@playwright/test').Page) {
  const ribbon = page.getByRole('region', { name: 'Left toolbar' });
  await ribbon.getByRole('button', { name: 'Command Palette' }).click();
  const commandDialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(commandDialog).toBeVisible();
  await commandDialog.getByRole('textbox', { name: 'Search commands' }).fill('Split Topic');
  await commandDialog.getByRole('button', { exact: true, name: 'Split Topic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Split Topic' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function readNode(page: import('@playwright/test').Page, title: string) {
  return page.evaluate((targetTitle) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return api?.listNodes().map((node) => api.getNode(node.id)).find((node) => node?.title === targetTitle) ?? null;
  }, title);
}

test('previews and confirms Split Topic from the command palette', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await seedSplitTopic(desktopWindow);

  let dialog = await openSplitTopicDialog(desktopWindow);
  await dialog.getByRole('textbox', { name: 'Delimiter' }).fill('---split---');
  await expect(dialog.getByRole('region', { name: 'Preview' })).toContainText(FIRST_TITLE);
  await expect(dialog.getByRole('region', { name: 'Preview' })).toContainText(SECOND_TITLE);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await readNode(desktopWindow, FIRST_TITLE)).toBeNull();
  expect(await desktopWindow.evaluate((nodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode(nodeId)?.trashed ?? null,
  SOURCE_TOPIC_ID)).toBe(false);

  dialog = await openSplitTopicDialog(desktopWindow);
  await dialog.getByRole('textbox', { name: 'Delimiter' }).fill('---split---');
  await dialog.getByRole('button', { name: 'Split Topic' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readNode(desktopWindow, FIRST_TITLE)).toMatchObject({
    content: expect.stringContaining('Alpha body'),
    trashed: false
  });
  await expect.poll(() => readNode(desktopWindow, SECOND_TITLE)).toMatchObject({ trashed: false });
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode(nodeId)?.trashed ?? null,
  SOURCE_TOPIC_ID)).toBe(true);
  await expect(desktopWindow.getByRole('treeitem', { name: FIRST_TITLE })).toBeVisible();
  await desktopWindow.getByRole('treeitem', { name: SECOND_TITLE }).click();
  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText('Beta body');

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('split-topic-dialog', { contentType: 'image/png', path: SCREENSHOT_PATH });
});
