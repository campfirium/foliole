import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { cycleRailAppearanceTo } from './appearance-mode-rail-support';
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
  const sourceFrame = source.locator('..');
  const targetFrame = target.locator('..');
  await targetFrame.hover({ trial: true });
  const sourceBox = await sourceFrame.boundingBox();
  const targetBox = await targetFrame.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Missing folder row bounds');
  const sourceY = sourceBox.y + sourceBox.height / 2;
  await sourceFrame.hover({ position: { x: sourceBox.width * 0.8, y: sourceBox.height / 2 } });
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width * 0.55, sourceY, { steps: 4 });
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
  await beginDrag(page, row('Hover second'), target, 0.125);
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
  await beginDrag(page, source, target, 0.125);
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'child');
  await cancelDrag(page);
  await page.waitForTimeout(650);
  await expect(target).toHaveAttribute('aria-expanded', 'false');
  await beginDrag(page, source, target, 0.125);
  await expect(target.locator('..')).toHaveAttribute('data-drop-intent', 'child');
  await expect(target).toHaveAttribute('aria-expanded', 'true');
  await screenshot(page, 'cross-tree-sustained-expansion');
  await cancelDrag(page);
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!
    .getNode('hover-topic')?.parentNodeId)).toBe('hover-source');
});

for (const theme of ['light', 'dark'] as const) {
  test(`distinguishes moving into a folder from sibling insertion in ${theme} mode`, async ({ desktopWindow: page }) => {
    await expectWorkspaceShell(page);
    await cycleRailAppearanceTo(page, theme);
    await seedFolders(page);
    await expect(page.locator('html')).toHaveAttribute('data-resolved-base-color', theme);

    const row = (name: string) => page.getByRole('treeitem', { name, exact: true });
    const folder = row('Hover target');
    await folder.press('ArrowRight');
    const nested = row('Hover child');
    const frame = nested.locator('..');
    const destination = page.getByRole('tooltip', { name: 'Move into “Hover child”' });

    await beginDrag(page, row('Hover second'), nested);
    await expect(destination).toBeVisible();
    const box = await frame.boundingBox();
    if (!box) throw new Error('Missing nested folder row bounds');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.125);
    await expect(frame).toHaveAttribute('data-drop-intent', 'before');
    await expect(destination).toHaveCount(0);
    await screenshot(page, `feedback-${theme}-sort-before`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
    await expect(destination).toBeVisible();
    const hint = page.locator('[data-node-drop-hint]');
    await expect(hint).toBeVisible();
    expect(await hint.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const underneath = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return underneath !== null &&
        underneath.closest('[data-radix-popper-content-wrapper]') !== element.parentElement;
    })).toBe(true);
    await screenshot(page, `feedback-${theme}-move-into`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.92);
    await expect(frame).toHaveAttribute('data-drop-intent', 'after');
    await expect(destination).toHaveCount(0);
    await screenshot(page, `feedback-${theme}-sort-after`);
    await cancelDrag(page);
    await expect(frame).not.toHaveAttribute('data-drop-intent', /.+/);
  });
}
