import path from 'node:path';

import type { Locator } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, setActiveSidebarTierDockedWidths } from './harness/settings';

test('shows the effective priority source and opens its review options', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const workspace = window.__folioleWorkspaceDebug!;
    await workspace.seedNodes([
      { id: 'source-folder', kind: 'folder', title: 'English', content: '', priority: 2 },
      { id: 'source-inherited', kind: 'topic', parentNodeId: 'source-folder', title: 'Inherited topic', content: 'Inherited priority' },
      { id: 'source-own', kind: 'topic', parentNodeId: 'source-folder', title: 'Own topic', content: 'Own priority', priority: 9 },
      { id: 'source-default', kind: 'topic', title: 'Default topic', content: 'Default priority' }
    ], { persist: true });
    await workspace.openNode('source-inherited');
  });
  await page.getByRole('button', { name: 'Scheduling panel', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByText('P2', { exact: true })).toBeVisible();
  await expect(inspector.getByText('(Inherited)', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'English', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review options · English' });
  const priority = dialog.getByRole('slider', { name: 'Review queue priority' });
  await expect(priority).toHaveValue('2');
  await priority.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(inspector.getByText('P3', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T859/priority-source.png') });
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('source-own'));
  await expect(inspector.getByText('Own', { exact: true })).toBeVisible();
  await expect(inspector.getByText('P9', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('source-default'));
  await expect(inspector.getByText('Default', { exact: true })).toBeVisible();
});


async function expectSchedulingRowsInBounds(inspector: Locator) {
  await expect.poll(() => inspector.locator('dd').evaluateAll(values => values.flatMap(value => {
    const rowBounds = value.closest('dl')!.getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(value);
    return [...text.getClientRects()].some(rect => rect.right > rowBounds.right + 1)
      ? [value.previousElementSibling?.textContent]
      : [];
  }))).toEqual([]);
}

test('keeps scheduling dates and inherited priorities readable while resizing the inspector', async ({ desktopWindow: page }) => {
  const titles = ['UninterruptedEnglishSourceTitle'.repeat(5), '一份标题很长的渐进式阅读资料'.repeat(5)];
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.setViewportSize({ width: 1400, height: 850 });
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async sourceTitles => {
    const workspace = window.__folioleWorkspaceDebug!;
    const reading = {
      intervalDurationMs: 86400000, intervalGrowthFactor: 1.15, lastHandledAt: '2026-11-13T01:17:21Z',
      nextAt: '2026-11-14T01:17:21Z', priority: 2, readingPosition: 0, repetitionCount: 1, state: 'active'
    } as const;
    await workspace.seedNodes(sourceTitles.flatMap((title, index) => [
      { id: `folder-${index}`, kind: 'folder' as const, title, content: '', priority: 2 },
      { id: `topic-${index}`, kind: 'topic' as const, parentNodeId: `folder-${index}`, title: `Topic ${index}`, content: 'Text', reading }
    ]), { persist: true });
    await workspace.openNode('topic-0');
  }, titles);
  await page.getByRole('button', { name: 'Scheduling panel', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByText('P2', { exact: true })).toBeVisible();
  await expect(inspector.getByText('Next scheduled', { exact: true })).toBeVisible();
  for (const width of [18, 24, 34]) {
    await setActiveSidebarTierDockedWidths(page, 25, width);
    await expectSchedulingRowsInBounds(inspector);
  }
  await setActiveSidebarTierDockedWidths(page, 25, 18);
  for (const [index, title] of titles.entries()) {
    await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), `topic-${index}`);
    const source = inspector.getByRole('button', { name: title, exact: true });
    await expect(source).toBeVisible();
    await expectSchedulingRowsInBounds(inspector);
    await source.click();
    const dialog = page.getByRole('dialog', { name: `Review options · ${title}` });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});
