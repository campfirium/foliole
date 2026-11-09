import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_TITLE = 'Topic Membership Folder';
const LIBRARY_FOLDER_TITLE = 'Membership topic source';
const MENU_TOPIC_TITLE = 'Menu Membership Topic';
const DRAG_TOPIC_TITLE = 'Drag Membership Topic';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/virtual-folder-topic-membership.png');
const PALETTE_SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/add-to-virtual-folder-palette.png');

async function dragBetweenRows(
  page: Parameters<typeof expectWorkspaceShell>[0],
  source: ReturnType<typeof page.getByRole>,
  target: ReturnType<typeof page.getByRole>,
  targetYRatio = 0.5
) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('missing Topic or virtual folder bounds');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * targetYRatio, { steps: 8 });
  await expect(target).toHaveAttribute('data-drop-intent', targetYRatio > 0.75 ? 'after' : 'child');
  await page.mouse.up();
}

test('adds Topics to a manual virtual folder from the menu and by drag without moving them', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'membership-topic-source', kind: 'folder', title: 'Membership topic source' },
      { content: 'Menu membership body', id: 'menu-membership-topic', kind: 'topic', title: 'Menu Membership Topic',
        parentNodeId: 'membership-topic-source' },
      { content: 'Drag membership body', id: 'drag-membership-topic', kind: 'topic', title: 'Drag Membership Topic',
        parentNodeId: 'membership-topic-source' }
    ]);
  });
  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptorPath = path.join(userDataPath, 'cache', 'agent-control-session.json');
  const created = await runAgentCli(['virtual-folders/create', '--descriptor', descriptorPath, '--title', FOLDER_TITLE]);
  expect(created.status).toBe(0);

  const virtualFolderRow = desktopWindow.getByRole('treeitem', { name: FOLDER_TITLE });
  await expect(virtualFolderRow).toBeVisible({ timeout: 10_000 });
  await desktopWindow.getByRole('treeitem', { name: LIBRARY_FOLDER_TITLE, exact: true }).click();
  const topicPanel = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  const menuTopic = topicPanel.getByRole('treeitem', { name: MENU_TOPIC_TITLE });
  const dragTopic = topicPanel.getByRole('treeitem', { name: DRAG_TOPIC_TITLE });
  await expect(menuTopic).toBeVisible();
  await menuTopic.click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Add to Virtual Folder…|添加到虚拟文件夹\.\.\.)$/ }).click();
  const membershipDialog = desktopWindow.getByRole('dialog', { name: /^(Add to Virtual Folder|添加到虚拟文件夹)$/ });
  const membershipSearch = membershipDialog.getByRole('textbox', { name: /^(Add to virtual folder|添加到虚拟文件夹)$/ });
  await expect(membershipSearch).toBeFocused();
  await membershipSearch.fill('Topic Membership');
  await expect(membershipDialog.getByRole('button', { name: FOLDER_TITLE })).toBeVisible();
  await mkdir(path.dirname(PALETTE_SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: PALETTE_SCREENSHOT_PATH });
  await testInfo.attach('add-to-virtual-folder-palette', { contentType: 'image/png', path: PALETTE_SCREENSHOT_PATH });
  await membershipSearch.press('Enter');
  await expect(menuTopic).toBeVisible();

  await expect(dragTopic.locator('..')).toHaveAttribute('draggable', 'true');
  await dragBetweenRows(desktopWindow, dragTopic.locator('..'), virtualFolderRow.locator('..'));
  await expect(dragTopic).toBeVisible();
  await virtualFolderRow.click();
  const virtualMenuTopic = topicPanel.getByRole('treeitem', { name: MENU_TOPIC_TITLE });
  const virtualDragTopic = topicPanel.getByRole('treeitem', { name: DRAG_TOPIC_TITLE });
  await expect(virtualMenuTopic).toBeVisible();
  await expect(virtualDragTopic).toBeVisible();
  await dragBetweenRows(desktopWindow, virtualMenuTopic.locator('..'), virtualDragTopic.locator('..'), 0.8);
  await expect.poll(() => topicPanel.getByRole('treeitem').allTextContents()).toEqual([
    DRAG_TOPIC_TITLE, MENU_TOPIC_TITLE
  ]);
  await desktopWindow.getByRole('treeitem', { name: LIBRARY_FOLDER_TITLE, exact: true }).click();
  await virtualFolderRow.click();
  await expect.poll(() => topicPanel.getByRole('treeitem').allTextContents()).toEqual([
    DRAG_TOPIC_TITLE, MENU_TOPIC_TITLE
  ]);
  await topicPanel.getByRole('treeitem', { name: DRAG_TOPIC_TITLE }).click();
  await expect(virtualFolderRow).toHaveAttribute('aria-selected', 'true');
  await expect(topicPanel.getByRole('treeitem', { name: MENU_TOPIC_TITLE })).toBeVisible();
  await expect(desktopWindow.getByText('Drag membership body', { exact: true })).toBeVisible();

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('virtual-folder-topic-membership', { contentType: 'image/png', path: SCREENSHOT_PATH });
});

test('references a real folder and shows its Topic tree in a virtual folder', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'virtual-source', kind: 'folder', title: 'Reference source', content: '' },
      { id: 'virtual-nested', kind: 'folder', title: 'Nested source', parentNodeId: 'virtual-source', content: '' },
      { id: 'virtual-source-topic', kind: 'topic', title: 'Referenced Topic', parentNodeId: 'virtual-nested', content: 'Source body' },
      { id: 'virtual-source-item', kind: 'item', title: 'Referenced card', parentNodeId: 'virtual-source-topic', content: 'Question', reveal: 'Answer' }
    ], { persist: true });
  });
  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptorPath = path.join(userDataPath, 'cache', 'agent-control-session.json');
  const created = await runAgentCli(['virtual-folders/create', '--descriptor', descriptorPath, '--title', FOLDER_TITLE]);
  expect(created.status).toBe(0);

  const source = page.getByRole('treeitem', { name: 'Reference source', exact: true });
  const virtual = page.getByRole('treeitem', { name: FOLDER_TITLE });
  await expect(virtual).toBeVisible();
  await source.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^(Add to Virtual Folder|添加到虚拟文件夹)/ }).click();
  await page.getByRole('dialog', { name: /^(Add to Virtual Folder|添加到虚拟文件夹)$/ })
    .getByRole('button', { name: FOLDER_TITLE }).click();
  await virtual.click();
  const topics = page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  const topic = topics.getByRole('treeitem', { name: /Referenced Topic/ });
  await expect(topic).toHaveAttribute('aria-expanded', /true|false/);
  if (await topic.getAttribute('aria-expanded') === 'false') {
    await topic.locator('[data-node-tree-chevron]').click();
  }
  await expect(topics.getByRole('treeitem', { name: 'Referenced card' })).toBeVisible();
  await page.reload();
  await expectWorkspaceShell(page);
  await virtual.click();
  await expect(topic).toBeVisible();

  await topic.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^(Add to Virtual Folder|添加到虚拟文件夹)/ }).click();
  await page.getByRole('dialog', { name: /^(Add to Virtual Folder|添加到虚拟文件夹)$/ })
    .getByRole('button', { name: FOLDER_TITLE }).click();
  await expect(topic).toHaveCount(1);
  await topic.click({ button: 'right' });
  await expect(page.getByText(/^(From |来自)Reference source$/)).toBeVisible();
  await page.getByRole('menuitem', { name: /^(Remove Direct Reference|移除单独添加)$/ }).click();
  await expect(topic).toHaveCount(1);
  await topic.click({ button: 'right' });
  await expect(page.getByText(/^(From |来自)Reference source$/)).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^(Remove Direct Reference|移除单独添加)$/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await virtual.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Remove from This Virtual Folder.*Reference source|从此虚拟文件夹中移除.*Reference source/ }).click();
  await expect(topic).toHaveCount(0);
  const snapshot = await page.evaluate(() => window.electronAPI.invoke('load_workspace_snapshot', {}));
  expect(snapshot.nodesById['virtual-source-topic']?.parentNodeId).toBe('virtual-nested');
  expect(snapshot.nodesById['virtual-source-item']?.parentNodeId).toBe('virtual-source-topic');
  await dragBetweenRows(page, source.locator('..'), virtual.locator('..'));
  await expect(topic).toBeVisible();
});
