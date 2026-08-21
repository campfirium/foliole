import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve(
  '.tmp/artifacts/desktop-acceptance/knowledge-tree-structural-drag.png'
);

async function dragIntoTopic(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('missing knowledge tree topic row bounds');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('reparents an ordinary Topic by drag without Alt', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'tree-drag-folder', kind: 'folder', title: 'Tree drag folder' },
      {
        content: 'Source body', id: 'tree-drag-source', kind: 'topic',
        parentNodeId: 'tree-drag-folder', title: 'Tree drag source'
      },
      {
        content: 'Target body', id: 'tree-drag-target', kind: 'topic',
        parentNodeId: 'tree-drag-folder', title: 'Tree drag target'
      }
    ], { persist: false });
  });

  await desktopWindow.getByRole('treeitem', { name: 'Tree drag folder' }).click();
  const column = desktopWindow.getByRole('complementary', {
    name: /^(Current folder contents|当前文件夹内容)$/
  });
  const source = column.getByRole('treeitem', { name: 'Tree drag source' }).locator('..');
  const target = column.getByRole('treeitem', { name: 'Tree drag target' }).locator('..');
  await expect(source).toHaveAttribute('draggable', 'true');
  await dragIntoTopic(desktopWindow, source, target);

  await expect.poll(() => desktopWindow.evaluate(() => (
    window.__folioleWorkspaceDebug?.getNode?.('tree-drag-source')?.parentNodeId ?? null
  ))).toBe('tree-drag-target');
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('knowledge-tree-structural-drag', {
    contentType: 'image/png',
    path: SCREENSHOT_PATH
  });
});
