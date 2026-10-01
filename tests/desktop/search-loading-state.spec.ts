import { promises as fs } from 'node:fs';

import { expect, test } from './harness/fixtures';

test('search shows progress before a completed empty result', async ({ desktopWindow }) => {
  await expect(desktopWindow.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  });
  await desktopWindow.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  await fs.mkdir('.tmp/artifacts/search-loading', { recursive: true });
  const dialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await expect(dialog).toBeVisible();
  await desktopWindow.clock.install();
  await desktopWindow.clock.pauseAt(new Date(Date.now() + 1000));
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill('NoMatchingSearchLoadingNeedle20261001');
  await expect(dialog.getByRole('status')).toContainText(/Searching…|搜索中…/);
  await expect(dialog.getByText(/No matching results|没有匹配结果/)).toHaveCount(0);
  await desktopWindow.screenshot({ path: '.tmp/artifacts/search-loading/loading.png' });
  await desktopWindow.clock.resume();
  await expect(dialog.getByText(/No matching results|没有匹配结果/)).toBeVisible();
  await expect(dialog.getByText(/Searching…|搜索中…/)).toHaveCount(0);
  await desktopWindow.screenshot({ path: '.tmp/artifacts/search-loading/empty.png' });
});

test('search includes Trash descendants, marks them, and ranks live content first', async ({ desktopWindow: page }) => {
  await expect(page.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
    await window.__folioleWorkspaceDebug?.seedNodes([
      { id: 'index-live', kind: 'topic', title: 'SearchIndexAcceptance Live', content: 'SearchIndexAcceptance' },
      { id: 'index-parent', kind: 'folder', title: 'Trash parent', content: '' },
      { id: 'index-trash', parentNodeId: 'index-parent', kind: 'topic', title: 'SearchIndexAcceptance Trash', content: 'SearchIndexAcceptance' }
    ], { persist: true });
    await window.electronAPI?.invoke('soft_delete_nodes', { nodeIds: ['index-parent'], deletedAt: new Date().toISOString() });
  });
  await expect.poll(() => page.evaluate(async () => {
    const snapshot = await window.electronAPI?.invoke('search_workspace', { query: 'SearchIndexAcceptance' });
    return snapshot?.results.map((result) => ({ id: result.id, isTrashed: result.isTrashed }));
  })).toEqual([{ id: 'index-live', isTrashed: false }, { id: 'index-trash', isTrashed: true }]);
  await page.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const dialog = page.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill('SearchIndexAcceptance');
  await expect(dialog.getByRole('button', { name: /SearchIndexAcceptance Trash/ })).toBeVisible();
  await expect(dialog.getByText(/^(Trash|回收站)$/)).toBeVisible();
  await fs.mkdir('.tmp/artifacts/search-loading', { recursive: true });
  await page.screenshot({ path: '.tmp/artifacts/search-loading/trash.png' });
});
