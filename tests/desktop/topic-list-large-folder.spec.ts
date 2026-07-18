import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_TITLE = 'Playwright Large Folder';
const TOPIC_COUNT = 152;

async function seedLargeFolder(desktopWindow: Page) {
  await desktopWindow.evaluate(async ({ folderTitle, topicCount }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: '', id: 'playwright-large-folder', kind: 'folder', title: folderTitle },
      ...Array.from({ length: topicCount }, (_, index) => ({
        content: `Body ${index + 1}`,
        id: `playwright-large-topic-${index + 1}`,
        kind: 'topic' as const,
        parentNodeId: 'playwright-large-folder',
        title: `Playwright Large Topic ${index + 1}`
      }))
    ]);
  }, { folderTitle: FOLDER_TITLE, topicCount: TOPIC_COUNT });
}

test('keeps a virtualized large-folder topic list visible', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedLargeFolder(desktopWindow);

  await desktopWindow.getByRole('treeitem', { name: FOLDER_TITLE, exact: true }).click();
  const topicPanel = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  const topicTree = topicPanel.getByRole('tree', { name: /^(Topic list|主题列表)$/ });

  await expect(topicTree.locator('[data-virtual-list="true"]')).toBeVisible();
  await expect(topicTree.getByRole('treeitem').first()).toBeVisible();

  const toggleLeftPanel = desktopWindow.getByRole('button', { name: /^(Toggle left panel|切换左侧面板)$/ });
  await toggleLeftPanel.click();
  await expect(topicPanel).toBeHidden();
  await toggleLeftPanel.click();
  await expect(topicTree.getByRole('treeitem').first()).toBeVisible();
  await testInfo.attach('large-folder-topic-list', {
    body: await topicPanel.screenshot(),
    contentType: 'image/png'
  });
});
