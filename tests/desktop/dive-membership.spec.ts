import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('creates a Dive in the tree and shows sources added from library menus', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'dive-folder', kind: 'folder', title: 'Probability sources' },
      { content: '', id: 'dive-subfolder', kind: 'folder', parentNodeId: 'dive-folder', title: 'Nested sources' },
      { content: 'Conditional probability body', id: 'dive-nested-topic', kind: 'topic', parentNodeId: 'dive-subfolder', title: 'Conditional probability' },
      { content: 'Independent notes', id: 'dive-topic', kind: 'topic', title: 'Independent notes' },
      { content: 'Unrelated notes', id: 'unrelated-topic', kind: 'topic', title: 'Unrelated notes' }
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
  const diveRow = diveTree.getByRole('treeitem', { name: 'Probability review' });
  await diveRow.click();
  await expect(diveRow).toHaveAttribute('aria-selected', 'true');
  await expect(topicPanel.getByRole('treeitem', { name: 'Unrelated notes' })).toHaveCount(0);
  const nested = topicPanel.getByRole('treeitem', { name: 'Conditional probability' });
  await expect(nested).toBeVisible();
  await expect(topicPanel.getByRole('treeitem', { name: 'Independent notes' })).toBeVisible();
  await nested.click();
  await expect(desktopWindow.getByText('Conditional probability body', { exact: true })).toBeVisible();
  await expect(diveRow).toHaveAttribute('aria-selected', 'true');
  await expect(topicPanel.getByRole('treeitem', { name: 'Independent notes' })).toBeVisible();
  await desktopWindow.getByRole('treeitem', { name: 'Home', exact: true }).click();
  await expect(topicPanel.getByRole('treeitem', { name: 'Unrelated notes' })).toBeVisible();

  const dives = await desktopWindow.evaluate(async () => window.electronAPI?.invoke('list_dives'));
  expect(dives).toEqual([expect.objectContaining({
    title: 'Probability review', directSourceIds: ['dive-folder', 'dive-topic']
  })]);
});

test('adds one Topic from a folder without including its siblings', async ({ desktopWindow: page }) => {
  await prepareMembership(page);
  const library = page.getByRole('treeitem', { name: 'Source folder', exact: true });
  const topics = page.getByRole('complementary', { name: 'Current folder contents' });
  const dives = page.getByRole('tree', { name: 'Dives' });
  await library.click();
  await addSource(page, topics.getByRole('treeitem', { name: 'Chosen topic' }));
  await dives.getByRole('treeitem', { name: 'Study set' }).click();
  await expect(dives.getByRole('treeitem', { name: 'Chosen topic' })).toBeVisible();
  await expect(dives.getByRole('treeitem', { name: 'Source folder' })).toHaveCount(0);
  await expect(topics.getByRole('treeitem', { name: 'Chosen topic' })).toBeVisible();
  await expect(topics.getByRole('treeitem', { name: 'Sibling topic' })).toHaveCount(0);
});

test('removes a folder source while retaining an overlapping direct Topic', async ({ desktopWindow: page }, testInfo) => {
  await prepareMembership(page);
  const library = page.getByRole('treeitem', { name: 'Source folder', exact: true });
  const topics = page.getByRole('complementary', { name: 'Current folder contents' });
  const dives = page.getByRole('tree', { name: 'Dives' });
  const study = dives.getByRole('treeitem', { name: 'Study set' });
  await library.click();
  await addSource(page, topics.getByRole('treeitem', { name: 'Chosen topic' }));
  await addSource(page, library);
  await study.click();
  await expect(topics.getByRole('treeitem', { name: 'Sibling topic' })).toBeVisible();

  await dives.getByRole('treeitem', { name: 'Source folder' }).click({ button: 'right' });
  const remove = page.getByRole('menuitem', { name: 'Remove from This Dive' });
  await expect(remove).toBeVisible();
  const screenshot = path.resolve('.tmp/artifacts/desktop-acceptance/remove-dive-source.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('remove-dive-source', { path: screenshot, contentType: 'image/png' });
  await remove.click();
  await expect(dives.getByRole('treeitem', { name: 'Source folder' })).toHaveCount(0);
  await expect(topics.getByRole('treeitem', { name: 'Sibling topic' })).toHaveCount(0);
  await expect(topics.getByRole('treeitem', { name: 'Chosen topic' })).toBeVisible();
  await page.reload();
  await expectWorkspaceShell(page);
  await study.click();
  await expect(dives.getByRole('treeitem', { name: 'Source folder' })).toHaveCount(0);
  await removeSource(page, dives.getByRole('treeitem', { name: 'Chosen topic' }));
  await expect(topics.getByRole('treeitem')).toHaveCount(0);
  await library.click();
  await expect(topics.getByRole('treeitem', { name: 'Chosen topic' })).toBeVisible();
  await expect(topics.getByRole('treeitem', { name: 'Sibling topic' })).toBeVisible();
});

async function removeSource(page: Page, source: Locator) {
  await source.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove from This Dive' }).click();
  await expect(source).toHaveCount(0);
}

async function prepareMembership(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'source-folder', kind: 'folder', title: 'Source folder', content: '' },
      { id: 'chosen-topic', kind: 'topic', title: 'Chosen topic', parentNodeId: 'source-folder', content: 'Chosen body' },
      { id: 'sibling-topic', kind: 'topic', title: 'Sibling topic', parentNodeId: 'source-folder', content: 'Sibling body' }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  const dives = page.getByRole('tree', { name: 'Dives' });
  await dives.getByRole('treeitem', { name: 'Dives', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Create Dive' }).click();
  const rename = page.getByRole('textbox', { name: 'Rename Untitled Dive' });
  await rename.fill('Study set');
  await rename.press('Enter');
  await expect(dives.getByRole('treeitem', { name: 'Study set' })).toBeVisible();
}

async function addSource(page: Page, source: Locator) {
  await source.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to Dive…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to Dive' });
  await dialog.getByRole('button', { name: 'Study set' }).click();
  await expect(dialog).toBeHidden();
}
