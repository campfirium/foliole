import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('shows live recursive folder sizes across a persisted move, trash, restore and reload', async ({
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated()));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'count-source', kind: 'folder', title: 'Count source', content: '' },
      { id: 'count-target', kind: 'folder', title: 'Count target', content: '' },
      { id: 'count-branch', parentNodeId: 'count-source', kind: 'folder', title: 'Count branch', content: '' },
      { id: 'count-article', parentNodeId: 'count-branch', kind: 'topic', title: 'Count article', content: 'Extract this.' },
      { id: 'count-excerpt', parentNodeId: 'count-article', kind: 'topic', title: 'Count excerpt', content: 'Extract',
        anchorLink: { id: 'count-highlight', kind: 'highlight' } },
      { id: 'count-item', parentNodeId: 'count-excerpt', kind: 'item', title: 'Count item', content: 'Question', reveal: 'Answer' },
      { id: 'count-stays', parentNodeId: 'count-source', kind: 'topic', title: 'Count stays', content: 'Remains here.' }
    ], { persist: true });
  });

  const folderPanel = desktopWindow.getByRole('complementary', { name: /^(Node list panel|主题列表面板)$/ });
  const source = folderPanel.getByRole('treeitem', { name: 'Count source', exact: true });
  const target = folderPanel.getByRole('treeitem', { name: 'Count target', exact: true });
  const badge = '.node-tree-row-text[aria-hidden="true"]';
  await expect(source.locator(badge)).toHaveText('4');
  await expect(target.locator(badge)).toHaveText('');

  await source.click();
  const contents = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  await expect(contents.getByRole('treeitem', { name: 'Count stays', exact: true })).toBeVisible();
  await expect(contents.getByRole('treeitem', { name: 'Count article', exact: true })).toHaveCount(0);

  expect(await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug!.moveNodes(['count-branch'], 'count-target', 'child'))).toBe(true);
  await expect(source.locator(badge)).toHaveText('1');
  await expect(target.locator(badge)).toHaveText('3');

  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.deleteNode('count-branch'));
  await expect(target.locator(badge)).toHaveText('');
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.restoreNode('count-branch'))).toBe(true);
  await expect(target.locator(badge)).toHaveText('3');

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect(source.locator(badge)).toHaveText('1');
  await expect(target.locator(badge)).toHaveText('3');
});
