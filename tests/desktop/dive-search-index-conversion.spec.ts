import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const query = 'conversion-match';

test('converts the current index results into fixed Dive references', async ({ desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async query => {
    window.localStorage.setItem('foliole-app-language', 'en');
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'matching-a', kind: 'topic', title: `${query} Alpha`, content: 'Alpha body' },
      { id: 'matching-b', kind: 'topic', title: `${query} Beta`, content: 'Beta body' },
      { id: 'matching-derived', kind: 'topic', parentNodeId: 'matching-a', title: `${query} Child`, content: 'Child body' },
      { id: 'not-matching', kind: 'topic', title: 'Unrelated', content: 'Other body' }
    ], { persist: true });
    const now = new Date().toISOString();
    await window.electronAPI.invoke('create_folder', {
      nodeId: 'matching-index', kind: 'folder', title: query, content: '', reveal: null, anchorLink: null, position: null,
      isTitleManual: true, createdAt: now, updatedAt: now, parentNodeId: 'special-virtual-root',
      virtualFilter: { version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: query }] }
    });
  }, query);
  await page.reload();
  await expectWorkspaceShell(page);

  const indexes = page.getByRole('tree', { name: 'Virtual tree' });
  const index = indexes.getByRole('treeitem', { name: query, exact: true });
  const dive = page.getByRole('tree', { name: /^Dives?$/ }).getByRole('treeitem', { name: query, exact: true });
  const list = page.getByRole('complementary', { name: 'Current folder contents' });
  await index.click();
  await expect(list.getByRole('treeitem', { name: `${query} Alpha`, exact: true })).toBeVisible();
  await expect(list.getByRole('treeitem', { name: `${query} Beta`, exact: true })).toBeVisible();
  const sources = () => page.evaluate(async title => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return Object.values(snapshot.nodesById).find(node => node.title === title)?.manualChildOrder?.slice().sort();
  }, query);

  await index.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Convert to Dive' }).click();
  await expect(index).toHaveCount(0);
  await expect(dive).toBeVisible();
  await expect.poll(sources).toEqual(['matching-a', 'matching-b']);
  await dive.click();
  await testInfo.attach('converted-search-index', { body: await page.screenshot(), contentType: 'image/png' });

  await page.evaluate(async query => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'matching-later', kind: 'topic', title: `${query} Later`, content: 'Later body' }
    ], { persist: true });
  }, query);
  await page.reload();
  await expectWorkspaceShell(page);
  await dive.click();
  await expect(list.getByRole('treeitem', { name: `${query} Later`, exact: true })).toHaveCount(0);
  expect(await sources()).toEqual(['matching-a', 'matching-b']);

  await dive.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Convert to Virtual' }).click();
  await expect(dive).toHaveCount(0);
  await index.click();
  await expect(list.getByRole('treeitem', { name: `${query} Alpha`, exact: true })).toBeVisible();
  await expect(list.getByRole('treeitem', { name: `${query} Later`, exact: true })).toHaveCount(0);
  expect(await sources()).toEqual(['matching-a', 'matching-b']);
});
