import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve(
  '.tmp/artifacts/desktop-acceptance/custom-order-surfaces.png'
);

function topicColumn(page: Parameters<typeof expectWorkspaceShell>[0]) {
  return page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
}

async function chooseManualSort(page: Page, surface: Locator) {
  await surface.getByRole('button', { name: /^(Sort list by .+|按.+排序列表)$/ }).click();
  await page.getByRole('menuitem', { name: /^(Manual|手动)$/ }).click();
  await expect(surface.getByRole('button', {
    name: /^(Sort list by Manual|按手动排序列表)$/
  })).toBeVisible();
}

async function dragTopicBefore(page: Page, sourceFrame: Locator, targetFrame: Locator) {
  await expect(sourceFrame).toHaveAttribute('draggable', 'true');
  const sourceBox = await sourceFrame.boundingBox();
  const targetBox = await targetFrame.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('missing manual-order topic row bounds');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 1, { steps: 8 });
  await expect(targetFrame).toHaveClass(/border-t-2/);
  await page.mouse.up();
}

async function expectCardOrder(folderView: Locator, labels: string[]) {
  const cards = folderView.getByRole('list', { name: /^(Folder contents|文件夹内容)$/ });
  await expect(cards.getByRole('button')).toHaveCount(labels.length);
  for (const [index, label] of labels.entries()) {
    await expect(cards.getByRole('button').nth(index)).toHaveAttribute('aria-label', label);
    await expect(cards.getByRole('button').nth(index)).not.toHaveAttribute('draggable');
  }
}

test('folder custom order is edited in the topic column and only displayed in content cards', async ({
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'custom-order-folder', kind: 'folder', title: 'Custom order folder' },
      {
        content: 'Alpha body', id: 'custom-order-alpha', kind: 'topic',
        parentNodeId: 'custom-order-folder', title: 'Alpha topic'
      },
      {
        content: 'Beta body', id: 'custom-order-beta', kind: 'topic',
        parentNodeId: 'custom-order-folder', title: 'Beta topic'
      }
    ], { persist: false });
  });

  await desktopWindow.getByRole('treeitem', { name: 'Custom order folder' }).click();
  const column = topicColumn(desktopWindow);
  await expect(column.getByRole('treeitem', { name: 'Alpha topic' })).toBeVisible();
  await chooseManualSort(desktopWindow, column);

  const sourceFrame = column.getByRole('treeitem', { name: 'Beta topic' }).locator('..');
  const targetFrame = column.getByRole('treeitem', { name: 'Alpha topic' }).locator('..');
  await dragTopicBefore(desktopWindow, sourceFrame, targetFrame);

  await expect.poll(async () => column.getByRole('treeitem').evaluateAll((items) => (
    items.map((item) => item.getAttribute('data-node-id'))
  ))).toEqual(['custom-order-beta', 'custom-order-alpha']);

  const folderView = desktopWindow.getByRole('region', {
    name: /^(Folder list view|文件夹列表视图)$/
  });
  await chooseManualSort(desktopWindow, folderView);
  await expectCardOrder(folderView, ['Open Beta topic', 'Open Alpha topic']);

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('custom-order-surfaces', {
    contentType: 'image/png',
    path: SCREENSHOT_PATH
  });
});
