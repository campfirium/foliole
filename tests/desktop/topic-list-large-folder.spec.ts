import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_TITLE = 'Playwright Large Folder';
const TOPIC_COUNT = 152;

async function readRowGeometry(virtualList: Locator) {
  return virtualList.locator('li').evaluateAll((rows) =>
    rows.slice(0, 3).map((row, index) => {
      const rect = row.getBoundingClientRect();
      const nextRect = rows[index + 1]?.getBoundingClientRect();
      return {
        gapToNext: nextRect ? Math.round(nextRect.top - rect.bottom) : null,
        height: Math.round(rect.height)
      };
    })
  );
}

function expectFixedRowGeometry(rowGeometry: Awaited<ReturnType<typeof readRowGeometry>>) {
  expect(rowGeometry.length).toBeGreaterThanOrEqual(2);
  expect(new Set(rowGeometry.map(({ height }) => height)).size).toBe(1);
  expect(rowGeometry.slice(0, -1).every(({ gapToNext }) => gapToNext === 0)).toBe(true);
}

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

  const folderList = desktopWindow.getByRole('region', { name: /^(Folder list view|文件夹列表视图)$/ });
  const virtualFolderList = folderList.locator('[data-virtual-list="true"]');
  await expect(virtualFolderList).toBeVisible();
  expectFixedRowGeometry(await readRowGeometry(virtualFolderList));

  const originalViewport = desktopWindow.viewportSize();
  await desktopWindow.setViewportSize({ height: 720, width: 900 });
  await desktopWindow.evaluate(() => {
    document.documentElement.style.setProperty('--app-font-size', '22px');
    document.documentElement.style.setProperty('--app-interface-font-family', 'Georgia, serif');
  });
  expectFixedRowGeometry(await readRowGeometry(virtualFolderList));

  const deepScrollTop = await folderList.evaluate((region) => {
    let scrollElement = region.parentElement;
    while (scrollElement && !['auto', 'scroll'].includes(getComputedStyle(scrollElement).overflowY)) {
      scrollElement = scrollElement.parentElement;
    }
    if (!scrollElement) return null;
    scrollElement.scrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight - 200);
    scrollElement.dispatchEvent(new Event('scroll'));
    return scrollElement.scrollTop;
  });
  expect(deepScrollTop).not.toBeNull();
  expect(deepScrollTop).toBeGreaterThan(0);
  await expect.poll(async () => Number(await virtualFolderList.locator('[data-index]').first().getAttribute('data-index')))
    .toBeGreaterThan(0);
  expectFixedRowGeometry(await readRowGeometry(virtualFolderList));
  if (originalViewport) {
    await desktopWindow.setViewportSize(originalViewport);
  }

  const toggleLeftPanel = desktopWindow.getByRole('button', { name: /^(Toggle left panel|切换左侧面板)$/ });
  await toggleLeftPanel.click();
  await expect(topicPanel).toBeHidden();
  await toggleLeftPanel.click();
  await expect(topicTree.getByRole('treeitem').first()).toBeVisible();
  await testInfo.attach('large-folder-topic-list', {
    body: await topicPanel.screenshot(),
    contentType: 'image/png'
  });
  await testInfo.attach('large-folder-fixed-row-list', {
    body: await folderList.screenshot(),
    contentType: 'image/png'
  });
});
