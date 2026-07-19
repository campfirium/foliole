import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_TITLE = 'Topic Membership Folder';
const MENU_TOPIC_TITLE = 'Menu Membership Topic';
const DRAG_TOPIC_TITLE = 'Drag Membership Topic';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/virtual-folder-topic-membership.png');

async function dragTopicToVirtualFolder(
  page: Parameters<typeof expectWorkspaceShell>[0],
  source: ReturnType<typeof page.getByRole>,
  target: ReturnType<typeof page.getByRole>
) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('missing Topic or virtual folder bounds');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await expect(target).toHaveClass(/border-border-strong/);
  await page.mouse.up();
}

test('adds Topics to a manual virtual folder from the menu and by drag without moving them', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      { content: 'Menu membership body', id: 'menu-membership-topic', kind: 'topic', title: 'Menu Membership Topic' },
      { content: 'Drag membership body', id: 'drag-membership-topic', kind: 'topic', title: 'Drag Membership Topic' }
    ]);
  });
  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptorPath = path.join(userDataPath, 'cache', 'agent-control-session.json');
  const created = await runAgentCli(['virtual-folders/create', '--descriptor', descriptorPath, '--title', FOLDER_TITLE]);
  expect(created.status).toBe(0);

  const virtualFolderRow = desktopWindow.getByRole('treeitem', { name: FOLDER_TITLE });
  await expect(virtualFolderRow).toBeVisible({ timeout: 10_000 });
  await desktopWindow.getByRole('treeitem', { name: 'Home', exact: true }).click();
  const topicPanel = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  const menuTopic = topicPanel.getByRole('treeitem', { name: MENU_TOPIC_TITLE });
  const dragTopic = topicPanel.getByRole('treeitem', { name: DRAG_TOPIC_TITLE });
  await expect(menuTopic).toBeVisible();
  await menuTopic.click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Add to Virtual Folder…|添加到虚拟文件夹\.\.\.)$/ }).click();
  await desktopWindow.getByRole('dialog').getByRole('button', { name: FOLDER_TITLE }).click();
  await expect(menuTopic).toBeVisible();

  await expect(dragTopic.locator('..')).toHaveAttribute('draggable', 'true');
  await dragTopicToVirtualFolder(desktopWindow, dragTopic.locator('..'), virtualFolderRow.locator('..'));
  await expect(dragTopic).toBeVisible();
  await virtualFolderRow.click();
  await expect(topicPanel.getByRole('treeitem', { name: MENU_TOPIC_TITLE })).toBeVisible();
  await expect(topicPanel.getByRole('treeitem', { name: DRAG_TOPIC_TITLE })).toBeVisible();

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('virtual-folder-topic-membership', { contentType: 'image/png', path: SCREENSHOT_PATH });
});
