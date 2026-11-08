import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('creates a Dive in the tree and shows sources added from library menus', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'dive-folder', kind: 'folder', title: 'Probability sources' },
      { content: 'Independent notes', id: 'dive-topic', kind: 'topic', title: 'Independent notes' }
    ]);
  });
  const diveTree = desktopWindow.getByRole('tree', { name: /^(Dives|专题)$/ });
  await diveTree.getByRole('treeitem', { name: /^(Dives|专题)$/ }).click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Create Dive|创建专题)$/ }).click();
  const name = diveTree.getByRole('textbox');
  await name.fill('Probability review');
  await name.press('Enter');
  await expect(diveTree.getByRole('treeitem', { name: 'Probability review' })).toBeVisible();

  const menu = desktopWindow.getByRole('menuitem', { name: /^(Add to Dive…|添加到专题…)$/ });
  const picker = desktopWindow.getByRole('dialog', { name: /^(Add to Dive|添加到专题)$/ });
  await desktopWindow.getByRole('treeitem', { name: 'Probability sources' }).click({ button: 'right' });
  await menu.click();
  await expect(picker.getByRole('button', { name: /^(New Dive|Create Dive|新建专题|创建专题)$/ })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Probability review' }).click();
  await expect(diveTree.getByRole('treeitem', { name: 'Probability sources' })).toBeVisible();

  await desktopWindow.getByRole('treeitem', { name: 'Home', exact: true }).click();
  const topicPanel = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  await topicPanel.getByRole('treeitem', { name: 'Independent notes' }).click({ button: 'right' });
  await menu.click();
  const search = picker.getByRole('textbox');
  await search.fill('Probability');
  await expect(picker.getByRole('button', { name: 'Probability review' })).toBeVisible();
  const screenshot = path.resolve('.tmp/artifacts/desktop-acceptance/add-to-dive.png');
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('add-to-dive', { path: screenshot, contentType: 'image/png' });
  await search.press('Enter');
  await expect(picker).toBeHidden();

  await expect(diveTree.getByRole('treeitem', { name: 'Independent notes' })).toBeVisible();
  const dives = await desktopWindow.evaluate(async () => window.electronAPI?.invoke('list_dives'));
  expect(dives).toEqual([expect.objectContaining({
    title: 'Probability review', directSourceIds: ['dive-folder', 'dive-topic']
  })]);
});
