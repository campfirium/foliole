import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const PARENT_TITLE = 'Parent Virtual Folder';
const DRAGGED_TITLE = 'Dragged Virtual Folder';
const CHILD_TITLE = 'Created Child Folder';
const TOPIC_TITLE = 'Nested Folder Topic';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/virtual-folder-nesting.png');

async function createFolder(
  page: Parameters<typeof expectWorkspaceShell>[0],
  buttonName: string | RegExp,
  title: string
) {
  await page.getByRole('button', { name: buttonName }).click();
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
  await expect(target).toHaveClass(/border-border-strong/);
  await page.mouse.up();
}

test('creates and nests virtual folders without aggregating child Topics', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (topicTitle) => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      { content: 'Nested body', id: 'nested-folder-topic', kind: 'topic', title: topicTitle }
    ]);
  }, TOPIC_TITLE);
  const rootCreate = /^(Create Virtual Folder|创建虚拟文件夹)$/;
  const parent = await createFolder(desktopWindow, rootCreate, PARENT_TITLE);
  const dragged = await createFolder(desktopWindow, rootCreate, DRAGGED_TITLE);
  await dragFolder(desktopWindow, dragged.locator('..'), parent.locator('..'));
  await expect(dragged).toHaveAttribute('aria-level', '3');

  const child = await createFolder(
    desktopWindow,
    /^(Create Virtual Folder in Parent Virtual Folder|在 Parent Virtual Folder 中创建虚拟文件夹)$/,
    CHILD_TITLE
  );
  await expect(child).toHaveAttribute('aria-level', '3');
  await desktopWindow.getByRole('treeitem', { name: 'Home', exact: true }).click();
  await desktopWindow.getByRole('treeitem', { name: TOPIC_TITLE }).click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Add to Virtual Folder…|添加到虚拟文件夹\.\.\.)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /^(Add to Virtual Folder|添加到虚拟文件夹)$/ });
  await dialog.getByRole('button', { name: CHILD_TITLE }).click();

  const topicPanel = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
  await parent.click();
  await expect(topicPanel.getByRole('treeitem', { name: TOPIC_TITLE })).toHaveCount(0);
  await child.click();
  await expect(topicPanel.getByRole('treeitem', { name: TOPIC_TITLE })).toBeVisible();
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect(desktopWindow.getByRole('treeitem', { name: DRAGGED_TITLE })).toHaveAttribute('aria-level', '3');
  await expect(desktopWindow.getByRole('treeitem', { name: CHILD_TITLE })).toHaveAttribute('aria-level', '3');
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('virtual-folder-nesting', { contentType: 'image/png', path: SCREENSHOT_PATH });
});
