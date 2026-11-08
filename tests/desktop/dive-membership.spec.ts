import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('creates a Dive from the folder menu and adds a Topic from its menu', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'dive-folder', kind: 'folder', title: 'Probability sources' },
      { content: 'Independent notes', id: 'dive-topic', kind: 'topic', title: 'Independent notes' }
    ]);
  });
  const menu = desktopWindow.getByRole('menuitem', { name: /^(Add to Dive…|添加到专题…)$/ });
  await desktopWindow.getByRole('treeitem', { name: 'Probability sources' }).click({ button: 'right' });
  await menu.click();
  const picker = desktopWindow.getByRole('dialog', { name: /^(Add to Dive|添加到专题)$/ });
  await picker.getByRole('button', { name: /^(New Dive|新建专题)$/ }).click();
  const name = desktopWindow.getByRole('textbox', { name: /^(Dive name|专题名称)$/ });
  await name.fill('Probability review');
  await desktopWindow.getByRole('button', { name: /^(Create and add|创建并添加)$/ }).click();
  await expect(desktopWindow.getByText(/^(Added to Probability review\.|已添加到「Probability review」。)$/)).toBeVisible();

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

  const dives = await desktopWindow.evaluate(async () => window.electronAPI?.invoke('list_dives'));
  expect(dives).toEqual([expect.objectContaining({
    title: 'Probability review', directSourceIds: ['dive-folder', 'dive-topic']
  })]);
});
