import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_TOPIC_ID = 'playwright-split-topic-source';
const KEEP_SOURCE_TOPIC_ID = 'playwright-split-topic-keep-source';
const SOURCE_TITLE = 'Playwright Split Topic Source';
const FIRST_TITLE = 'Split Alpha';
const SECOND_TITLE = 'Split Beta';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/split-topic-dialog.png');

async function seedSplitTopic(page: import('@playwright/test').Page) {
  await page.evaluate(async ({ keepSourceTopicId, sourceTopicId, sourceTitle }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: '## Split Alpha\n\nAlpha body\n\n---split---\n\n### Split Beta\n\n#### Beta detail',
        id: sourceTopicId,
        kind: 'topic',
        title: sourceTitle
      },
      {
        content: '## Keep Alpha\n\nAlpha body\n\n---keep---\n\n### Keep Beta\n\nBeta body',
        id: keepSourceTopicId,
        kind: 'topic',
        title: 'Keep Source'
      }
    ]);
    await api?.openNode?.(sourceTopicId);
  }, { keepSourceTopicId: KEEP_SOURCE_TOPIC_ID, sourceTitle: SOURCE_TITLE, sourceTopicId: SOURCE_TOPIC_ID });
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
  await expect(dialog.getByRole('radio', { name: 'Replace' })).toBeChecked();
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await dialog.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('split-topic-dialog', { contentType: 'image/png', path: SCREENSHOT_PATH });
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
  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText('Beta detail');
  expect((await readNode(desktopWindow, FIRST_TITLE))?.content).toContain('# Split Alpha');
  expect((await readNode(desktopWindow, SECOND_TITLE))?.content).toContain('## Beta detail');

  await desktopWindow.evaluate((nodeId) => globalThis.window?.__folioleWorkspaceDebug?.openNode?.(nodeId), KEEP_SOURCE_TOPIC_ID);
  dialog = await openSplitTopicDialog(desktopWindow);
  await dialog.getByRole('textbox', { name: 'Delimiter' }).fill('---keep---');
  await dialog.getByRole('radio', { name: 'Keep' }).click();
  await dialog.getByRole('switch', { name: 'Keep delimiter' }).click();
  await dialog.getByRole('button', { name: 'Split Topic' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readNode(desktopWindow, 'Keep Alpha')).toMatchObject({ parentNodeId: KEEP_SOURCE_TOPIC_ID, trashed: false });
  await expect.poll(() => readNode(desktopWindow, 'Keep Beta')).toMatchObject({ parentNodeId: KEEP_SOURCE_TOPIC_ID, trashed: false });
  expect((await readNode(desktopWindow, 'Keep Alpha'))?.content.trimEnd().endsWith('---keep---')).toBe(true);
  expect((await readNode(desktopWindow, 'Keep Beta'))?.content.trimStart().startsWith('---keep---')).toBe(false);
  expect(await desktopWindow.evaluate((nodeId) => globalThis.window?.__folioleWorkspaceDebug?.getNode(nodeId)?.trashed ?? null, KEEP_SOURCE_TOPIC_ID)).toBe(false);

  await desktopWindow.evaluate((nodeId) => globalThis.window?.__folioleWorkspaceDebug?.openNode?.(nodeId), KEEP_SOURCE_TOPIC_ID);
  dialog = await openSplitTopicDialog(desktopWindow);
  await expect(dialog.getByRole('radio', { name: 'Keep' })).toBeChecked();
  await expect(dialog.getByRole('textbox', { name: 'Delimiter' })).toHaveValue('---keep---');
  await expect(dialog.getByRole('switch', { name: 'Keep delimiter' })).toBeChecked();
  await expect(dialog.getByRole('textbox', { name: 'Before' })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: 'After' })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});
