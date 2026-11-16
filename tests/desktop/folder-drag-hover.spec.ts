import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedFolders(page: Page) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'hover-source', title: 'Hover source', kind: 'folder', content: '' },
      { id: 'hover-topic', title: 'Hover topic', kind: 'topic', content: 'Saved body', parentNodeId: 'hover-source' },
      { id: 'hover-second', title: 'Hover second', kind: 'folder', content: '' },
      { id: 'hover-target', title: 'Hover target', kind: 'folder', content: '' },
      { id: 'hover-child', title: 'Hover child', kind: 'folder', content: '', parentNodeId: 'hover-target' }
    ]);
  });
  await expect(page.getByRole('treeitem', { name: 'Hover target', exact: true }))
    .toHaveAttribute('aria-expanded', 'false');
}

async function beginDrag(page: Page, source: Locator, target: Locator, ratio = 0.5) {
  const sourceBox = await source.locator('..').boundingBox();
  const targetBox = await target.locator('..').boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Missing folder row bounds');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * ratio, { steps: 8 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * ratio);
}

async function cancelDrag(page: Page) {
  await page.keyboard.press('Escape');
  await page.mouse.up();
}

async function screenshot(page: Page, name: string) {
  const directory = path.resolve('.tmp/artifacts/T785');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
}

test('keeps passing folders stable and commits early and sustained folder drops', async ({ desktopWindow: page }) => {
  await seedFolders(page);
  const row = (name: string) => page.getByRole('treeitem', { name, exact: true });
  const target = row('Hover target');
  await beginDrag(page, row('Hover second'), target, 0.05);
  await screenshot(page, 'initial-native-drag');
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'before');
  await page.waitForTimeout(650);
  await expect(target).toHaveAttribute('aria-expanded', 'false');
  await screenshot(page, 'sorting-without-expansion');
  await cancelDrag(page);

  await beginDrag(page, row('Hover second'), target);
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'child');
  await page.waitForTimeout(150);
  await expect(target).toHaveAttribute('aria-expanded', 'false');
  await cancelDrag(page);
  await page.waitForTimeout(650);
  await expect(target).toHaveAttribute('aria-expanded', 'false');

  await beginDrag(page, row('Hover second'), target);
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'child');
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!
    .getNode('hover-second')?.parentNodeId)).toBe('hover-target');
  await page.waitForTimeout(650);
  await expect(target).toHaveAttribute('aria-expanded', 'false');

  await beginDrag(page, row('Hover source'), target);
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'child');
  await expect(target).toHaveAttribute('aria-expanded', 'true');
  await expect(row('Hover child')).toBeVisible();
  await screenshot(page, 'sustained-folder-expansion');
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!
    .getNode('hover-source')?.parentNodeId)).toBe('hover-target');
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const parents = await page.evaluate(() => ['hover-source', 'hover-second'].map(id =>
    window.__folioleWorkspaceDebug!.getNode(id)?.parentNodeId));
  expect(parents).toEqual(['hover-target', 'hover-target']);
});

test('cancels receiving-tree expansion when a cross-tree drag ends with Escape', async ({ desktopWindow: page }) => {
  await seedFolders(page);
  await page.getByRole('treeitem', { name: 'Hover source', exact: true }).click();
  const source = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ })
    .getByRole('treeitem', { name: 'Hover topic', exact: true });
  const target = page.getByRole('treeitem', { name: 'Hover target', exact: true });
  await beginDrag(page, source, target, 0.05);
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'child');
  await cancelDrag(page);
  await page.waitForTimeout(650);
  await expect(target).toHaveAttribute('aria-expanded', 'false');
  await beginDrag(page, source, target, 0.05);
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'child');
  await expect(target).toHaveAttribute('aria-expanded', 'true');
  await screenshot(page, 'cross-tree-sustained-expansion');
  await cancelDrag(page);
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!
    .getNode('hover-topic')?.parentNodeId)).toBe('hover-source');
});
