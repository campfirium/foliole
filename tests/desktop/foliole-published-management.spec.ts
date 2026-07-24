import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const TOPIC_ID = 'playwright-published-management-topic';
const TOPIC_TITLE = 'Published management topic';
const SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-published-management-hidden-native.png');
const DELETE_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/foliole-published-delete-hidden-native.png');

async function seedPublishedTopic(desktopWindow: Page, libraryHome: string) {
  await desktopWindow.evaluate(async ({ id, title }) => {
    await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([
      { content: `# ${title}\n\nPublic body.`, id, kind: 'topic', title }
    ]);
  }, { id: TOPIC_ID, title: TOPIC_TITLE });
  const publishRoot = path.join(libraryHome, 'Publish');
  await mkdir(path.join(publishRoot, 'Content'), { recursive: true });
  await writeFile(path.join(publishRoot, 'Content', '1.md'), `# ${TOPIC_TITLE}\n\nPublic body.`);
  await writeFile(path.join(publishRoot, 'publish.yaml'), `${JSON.stringify({
    next_topic_number: 2,
    site: { title: 'Acceptance Site' },
    topics: [{
      file: 'Content/1.md', number: 1, published_at: '2026-07-24T00:00:00.000Z',
      source_key: 'playwright-published-source', source_node_id: TOPIC_ID, status: 'published',
      title: TOPIC_TITLE, updated_at: '2026-07-24T00:00:00.000Z'
    }],
    version: 3
  }, null, 2)}\n`);
}

async function openPublishSettings(desktopWindow: Page) {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const region = dialog.getByRole('region', { name: /^(Publish to the site settings|Publish to the site 设置)$/ });
  const section = region.getByRole('button', { name: /^Publish to the site$/ });
  if (await section.getAttribute('aria-expanded') === 'false') await section.click();
  return { dialog, region };
}

test('opens Published from Settings and identifies its Topics and management actions', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  await seedPublishedTopic(desktopWindow, libraryHome);

  const { dialog, region } = await openPublishSettings(desktopWindow);
  const actions = region.getByRole('button').filter({ hasText: /^(Manage content|管理内容|View local|查看本地|View Web|查看网页)$/ });
  await expect(actions.nth(0)).toHaveText(/^(Manage content|管理内容)$/);
  await region.getByRole('button', { name: /^(Manage content|管理内容)$/ }).click();

  await expect(dialog).toBeHidden();
  await expect(desktopWindow.getByRole('treeitem', { name: /^(Published|已发布)$/ })).toHaveAttribute('aria-selected', 'true');
  const publishedTopic = desktopWindow.getByRole('treeitem', { name: new RegExp(TOPIC_TITLE, 'u') });
  await expect(publishedTopic).toBeVisible();
  await publishedTopic.click();
  await expect(desktopWindow.getByRole('button', { name: /^(Published|已发布)$/ })).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: /^(Unpublish|撤回)$/ })).toBeVisible();

  const screenshot = await desktopWindow.screenshot({ fullPage: true });
  await mkdir(path.dirname(SCREENSHOT), { recursive: true });
  await writeFile(SCREENSHOT, screenshot);
  await testInfo.attach('foliole-published-management', { body: screenshot, contentType: 'image/png' });

  await desktopWindow.getByRole('treeitem', { exact: true, name: 'Home' }).click();
  const topicPanel = desktopWindow.getByRole('complementary', {
    name: /^(Current folder contents|当前文件夹内容)$/
  });
  const normalTopic = topicPanel.getByRole('treeitem', { name: TOPIC_TITLE });
  await expect(normalTopic).toBeVisible();
  await normalTopic.click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Delete|删除)$/ }).click();
  const deleteDialog = desktopWindow.getByRole('dialog', {
    name: /^(This Topic is published|这个 Topic 已发布)$/
  });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByRole('button', {
    name: /^(Unpublish and move to Trash|撤回并移到废纸篓)$/
  })).toBeVisible();
  const deleteScreenshot = await desktopWindow.screenshot({ fullPage: true });
  await writeFile(DELETE_SCREENSHOT, deleteScreenshot);
  await testInfo.attach('foliole-published-delete', { body: deleteScreenshot, contentType: 'image/png' });
  await deleteDialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await expect.poll(() => desktopWindow.evaluate((nodeId) => (
    globalThis.window?.__folioleWorkspaceDebug?.getNode?.(nodeId)?.trashed ?? null
  ), TOPIC_ID)).toBe(false);
});
