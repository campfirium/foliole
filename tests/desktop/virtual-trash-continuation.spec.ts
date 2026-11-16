import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { collectNode, redoShortcut, undoShortcut } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { waitForStartupGuidedSample } from './harness/startupGuidedSample';

const id = (title: string) => `virtual-continuation-${title.toLowerCase()}`;
const names = ['Alpha', 'Bravo', 'Charlie'];
const token = 'virtualcontinuationtoken';
const resultName = (title: string, savedSearch: boolean) => savedSearch ? `${title} ${token}` : title;

async function prepare(page: Page, mode: 'manual' | 'search' | 'shelved') {
  await expectWorkspaceShell(page);
  await waitForStartupGuidedSample(page);
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await expect(exitFlow).toBeHidden();

  await page.evaluate(async entries => {
    await window.__folioleWorkspaceDebug!.seedNodes(entries, { persist: true });
  }, names.map(title => ({ id: id(title), kind: 'topic' as const,
    content: `# ${title}\n\n${title} body ${token}`, title: resultName(title, mode === 'search') })));
  if (mode === 'shelved') {
    for (const title of names) {
      const nodeId = id(title);
      await expect.poll(() => page.evaluate(value => window.__folioleWorkspaceDebug!.shelveNode(value), nodeId)).toBe(true);
      await expect.poll(async () => (await collectNode(page, nodeId))?.shelvedAt ?? null).not.toBeNull();
    }
  }
  const tree = page.getByRole('tree', { name: /^(Virtual tree|索引树)$/ });
  const column = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  return { tree, column, row: (title: string) => column.getByRole('treeitem', { name: resultName(title, mode === 'search'), exact: true }),
    body: page.locator('.prompt-editor-host .cm-content') };
}

async function sortByName(page: Page, column: Locator, savedSearch = false) {
  await column.getByRole('button', { name: /^(Sort list by .+|按.+排序列表)$/ }).click();
  await page.getByRole('menuitem', { name: /^(Name|名称)$/ }).click();
  await expect(column.getByRole('treeitem')).toHaveText(names.map(title => resultName(title, savedSearch)));
}

test('continues in manual reference order and keeps a removed reference out of Trash', async ({ desktopApp, desktopWindow: page }) => {
  const { tree, column, row, body } = await prepare(page, 'manual');
  const title = 'Manual continuation folder';
  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptor = path.join(userDataPath, 'cache', 'agent-control-session.json');
  expect((await runAgentCli(['virtual-folders/create', '--descriptor', descriptor, '--title', title])).status).toBe(0);
  const folder = tree.getByRole('treeitem', { name: title, exact: true });
  await expect(folder).toBeVisible();
  const folderId = (await folder.getAttribute('data-node-id'))!;
  expect((await runAgentCli(['virtual-folders/add-items', '--descriptor', descriptor, '--folder-id',
    folderId, '--material-ids', [id('Charlie'), id('Bravo'), id('Alpha')].join(',')])).status).toBe(0);
  await page.reload();
  await expectWorkspaceShell(page);

  await folder.click();
  await expect(column.getByRole('treeitem')).toHaveText(['Charlie', 'Bravo', 'Alpha']);
  await row('Bravo').click();
  await expect(body).toContainText('Bravo body');
  await row('Bravo').press('Delete');
  await expect(body).toContainText('Alpha body');
  await expect(body).not.toBeFocused();
  await expect(folder).toHaveAttribute('aria-selected', 'true');
  expect((await collectNode(page, id('Bravo')))?.trashed).toBe(true);

  await row('Charlie').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^(Remove from This Virtual Entry|从此索引中移除)$/ }).click();
  await expect(row('Charlie')).toHaveCount(0);
  expect((await collectNode(page, id('Charlie')))?.trashed).toBe(false);
  await expect(body).toContainText('Alpha body');
});

test('continues in the saved search and keeps its empty view through redo', async ({ desktopWindow: page }) => {
  const { tree, column, row, body } = await prepare(page, 'search');
  await page.evaluate(async token => {
    const now = new Date().toISOString();
    await window.electronAPI.invoke('create_folder', {
      nodeId: 'virtual-continuation-search', kind: 'folder', title: token, content: '', reveal: null,
      isTitleManual: true, anchorLink: null, position: null, createdAt: now, updatedAt: now,
      parentNodeId: 'special-virtual-root',
      virtualFilter: { version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: token }] }
    });
  }, token);
  await page.reload();
  await expectWorkspaceShell(page);
  const folder = tree.getByRole('treeitem', { name: token, exact: true });
  await folder.click();
  await sortByName(page, column, true);

  await row('Bravo').click();
  await expect(body).toContainText('Bravo body');
  await row('Bravo').press('Delete');
  await expect(body).toContainText('Charlie body');
  await row('Charlie').press('Delete');
  await expect(body).toContainText('Alpha body');
  await row('Alpha').press('Delete');
  await expect(column.getByRole('treeitem')).toHaveCount(0);
  await expect(folder).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press(undoShortcut());
  await expect(body).toContainText('Alpha body');
  await page.keyboard.press(redoShortcut());
  await expect(column.getByRole('treeitem')).toHaveCount(0);
  await expect(folder).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBeNull();
});

test('advances the selected Shelved row with the built-in view still open', async ({ desktopWindow: page }) => {
  const { tree, column, row } = await prepare(page, 'shelved');
  const folder = tree.locator('[data-node-id="special-virtual-shelved"]');
  await folder.click();
  await sortByName(page, column);

  await row('Bravo').click();
  await expect(row('Bravo')).toHaveAttribute('aria-selected', 'true');
  await row('Bravo').press('Delete');
  await expect(row('Charlie')).toHaveAttribute('aria-selected', 'true');
  await expect(folder).toHaveAttribute('aria-selected', 'true');
  expect((await collectNode(page, id('Bravo')))?.trashed).toBe(true);
});
