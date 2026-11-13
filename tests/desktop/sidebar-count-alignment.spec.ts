import type { Locator } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function expectCountsAligned(counts: Locator) {
  const edges = await counts.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().right));
  expect(edges.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(1);
}

test('Trash shows its aligned count when undo is absent', async ({ desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([
      { id: 'count-folder', kind: 'folder', title: 'Folder with a count', content: '' },
      { id: 'count-child', kind: 'topic', parentNodeId: 'count-folder', title: 'Kept topic', content: '' },
      { id: 'count-trash', kind: 'topic', title: 'Deleted topic', content: '' }
    ], { persist: true });
    await debug.deleteNode('count-trash');
  });
  await page.reload();
  await expectWorkspaceShell(page);

  const sidebar = page.locator('.workspace-folder-column');
  const counts = sidebar.locator('[role="treeitem"] .node-tree-row-text[aria-hidden="true"]');
  const trash = sidebar.locator('#node-treeitem-special-trash');
  const trashCount = trash.locator('.node-tree-row-text[aria-hidden="true"]');
  const undo = sidebar.getByRole('button', { name: 'Restore last deleted item' });
  await expect(trashCount).toHaveText('1');
  await expect(sidebar.getByRole('treeitem', { name: 'Folder with a count' })).toBeVisible();
  await expect(undo).toBeHidden();

  await testInfo.attach('folder-sidebar-counts', { body: await sidebar.screenshot(), contentType: 'image/png' });
  await expectCountsAligned(counts);

  await page.evaluate(() => window.__folioleWorkspaceDebug!.deleteNode('count-child'));
  await expect(undo).toBeVisible();
  await expect(trashCount).toBeHidden();
  await testInfo.attach('folder-sidebar-with-undo', { body: await sidebar.screenshot(), contentType: 'image/png' });

  await undo.click();
  await expect(undo).toBeHidden();
  await expect(trashCount).toHaveText('1');
  await expectCountsAligned(counts);
});
