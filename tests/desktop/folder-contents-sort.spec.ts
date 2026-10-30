import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('directory cards keep subfolders first in either name direction', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { id: 'sort-parent', kind: 'folder', title: 'Sorting parent', content: '' },
      { id: 'sort-doc-a', kind: 'topic', title: 'A document', content: 'Alpha', parentNodeId: 'sort-parent' },
      { id: 'sort-folder-b', kind: 'folder', title: 'B folder', content: '', parentNodeId: 'sort-parent' },
      { id: 'sort-doc-y', kind: 'topic', title: 'Y document', content: 'Beta', parentNodeId: 'sort-parent' },
      { id: 'sort-folder-z', kind: 'folder', title: 'Z folder', content: '', parentNodeId: 'sort-parent' }
    ], { persist: false });
  });
  await desktopWindow.getByRole('treeitem', { name: 'Sorting parent', exact: true }).click();
  const view = desktopWindow.getByRole('region', { name: /^(Folder list view|文件夹列表视图)$/ });
  const cards = view.getByRole('list', { name: /^(Folder contents|文件夹内容)$/ }).getByRole('button');
  await view.getByRole('button', { name: /^(Sort list by .+|按.+排序列表)$/ }).click();
  await desktopWindow.getByRole('menuitem', { name: /^(Name|名称)$/ }).click();
  await expect.poll(() => cards.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .toEqual(['Open B folder', 'Open Z folder', 'Open A document', 'Open Y document']);
  await view.getByRole('button', { name: /^(Sort list by .+|按.+排序列表)$/ }).click();
  await desktopWindow.getByRole('menuitem', { name: 'Z -> A', exact: true }).click();
  await expect.poll(() => cards.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .toEqual(['Open Z folder', 'Open B folder', 'Open Y document', 'Open A document']);
  const screenshot = path.resolve('.tmp/artifacts/T658/folders-first.png');
  await mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
});
