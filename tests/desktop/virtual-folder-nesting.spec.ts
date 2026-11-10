import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const PARENT_TITLE = 'Parent Virtual Folder';
const DRAGGED_TITLE = 'Dragged Virtual Folder';
const TOPIC_TITLE = 'Nested Folder Topic';
const LIBRARY_FOLDER_TITLE = 'Nested Topic Source';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/virtual-folder-nesting.png');

async function createFolder(
  page: Parameters<typeof expectWorkspaceShell>[0],
  buttonName: string | RegExp,
  title: string,
  role: 'button' | 'menuitem' = 'button'
) {
  await page.getByRole(role, { name: buttonName }).click();
  const renameInput = page.getByRole('textbox', { name: /^(Rename|重命名) / });
  await expect(renameInput).toBeVisible();
  await renameInput.fill(title);
  await renameInput.press('Enter');
  const row = page.getByRole('treeitem', { name: title });
  await expect(row).toBeVisible();
  return row;
}

async function dragFolder(
  page: Parameters<typeof expectWorkspaceShell>[0],
  source: ReturnType<typeof page.getByRole>,
  target: ReturnType<typeof page.getByRole>
) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('missing virtual folder bounds');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function createRootFolder(
  page: Parameters<typeof expectWorkspaceShell>[0],
  title: string
) {
  await page.getByRole('treeitem', { name: /^(Virtual|虚拟|索引)$/ }).click({ button: 'right' });
  return createFolder(page, /^(Create Virtual Folder|创建虚拟文件夹)$/, title, 'menuitem');
}

async function expectNativeNestingRejected(page: Parameters<typeof expectWorkspaceShell>[0]) {
  const errors = await page.evaluate(async ([parentTitle, draggedTitle]) => {
    const api = window.electronAPI;
    const snapshot = await api.invoke('load_workspace_snapshot', {});
    const parent = Object.values(snapshot.nodesById).find(node => node.title === parentTitle)!;
    const moved = Object.values(snapshot.nodesById).find(node => node.title === draggedTitle)!;
    const root = 'special-virtual-root';
    const rootIds = snapshot.nodeOrder.filter(id => snapshot.nodesById[id]?.parentNodeId === root);
    const now = new Date().toISOString();
    const nested = {
      nodeId: 'invalid-index-child', parentNodeId: parent.id, kind: 'folder' as const, title: 'Invalid child',
      isTitleManual: true, content: '', reveal: null, position: null, anchorLink: null,
      createdAt: now, updatedAt: now, virtualFilter: parent.virtualFilter ?? null
    };
    const create = await api.invoke('create_folder', nested).then(() => '', String);
    const update = await api.invoke('update_node_content', { ...nested, nodeId: moved.id, title: moved.title })
      .then(() => '', String);
    const move = await api.invoke('move_nodes', {
      nodes: [{ nodeId: moved.id, expectedParentNodeId: root, parentNodeId: parent.id, updatedAt: now }],
      parentOrders: [
        { parentNodeId: root, expectedChildIds: rootIds, childIds: rootIds.filter(id => id !== moved.id) },
        { parentNodeId: parent.id, expectedChildIds: [], childIds: [moved.id] }
      ], maintainSequentialReading: false, defaultPriority: 5
    }).then(() => '', String);
    return { create, move, update };
  }, [PARENT_TITLE, DRAGGED_TITLE]);
  expect(errors.create).toContain('Index directories must be top-level');
  expect(errors.update).toContain('Index directories must be top-level');
  expect(errors.move).toContain('invalid_move_parent');
}

test('keeps indexes flat and preserves independent Topic references', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async ({ topicTitle, folderTitle }) => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'nested-topic-source', kind: 'folder', title: folderTitle },
      { content: 'Nested body', id: 'nested-folder-topic', kind: 'topic', title: topicTitle, parentNodeId: 'nested-topic-source' }
    ]);
  }, { topicTitle: TOPIC_TITLE, folderTitle: LIBRARY_FOLDER_TITLE });
  const parent = await createRootFolder(desktopWindow, PARENT_TITLE);
  const dragged = await createRootFolder(desktopWindow, DRAGGED_TITLE);
  await dragFolder(desktopWindow, dragged.locator('..'), parent.locator('..'));
  await parent.click({ button: 'right' });
  await expect(desktopWindow.getByRole('menuitem', { name: /^(Rename|重命名)$/ })).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: /^(Create Virtual Folder|创建虚拟文件夹)$/ })).toHaveCount(0);
  await desktopWindow.keyboard.press('Escape');
  await expectNativeNestingRejected(desktopWindow);
  await desktopWindow.getByRole('treeitem', { name: LIBRARY_FOLDER_TITLE, exact: true }).click();
  await desktopWindow.getByRole('treeitem', { name: TOPIC_TITLE }).click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Add to Virtual Folder…|添加到虚拟文件夹\.\.\.)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /^(Add to Virtual Folder|添加到虚拟文件夹)$/ });
  await dialog.getByRole('button', { name: DRAGGED_TITLE }).click();

  const topicPanel = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  await parent.click();
  await expect(topicPanel.getByRole('treeitem', { name: TOPIC_TITLE })).toHaveCount(0);
  await dragged.click();
  await expect(topicPanel.getByRole('treeitem', { name: TOPIC_TITLE })).toBeVisible();
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const positions = await desktopWindow.evaluate(async titles => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return Object.values(snapshot.nodesById).filter(node => titles.includes(node.title)).map(node => node.parentNodeId);
  }, [PARENT_TITLE, DRAGGED_TITLE]);
  expect(positions).toEqual(['special-virtual-root', 'special-virtual-root']);
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('virtual-folder-nesting', { contentType: 'image/png', path: SCREENSHOT_PATH });
});
