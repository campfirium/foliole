import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_TITLE = 'Created Virtual Folder';
const TOPIC_TITLE = 'Virtual Folder Candidate';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/virtual-folder-creation.png');

test('creates, recognizes, and persists a manual virtual folder', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (topicTitle) => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      { content: 'Candidate body', id: 'virtual-folder-candidate', kind: 'topic', title: topicTitle }
    ]);
  }, TOPIC_TITLE);

  await desktopWindow.getByRole('treeitem', { name: 'Virtual', exact: true }).click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Create Virtual Folder|创建虚拟文件夹)$/ }).click();
  const renameInput = desktopWindow.getByRole('textbox', { name: /^(Rename|重命名) / });
  await expect(renameInput).toBeVisible();
  await renameInput.fill(FOLDER_TITLE);
  await renameInput.press('Enter');
  await expect(desktopWindow.getByRole('treeitem', { name: FOLDER_TITLE })).toBeVisible();

  await desktopWindow.getByRole('treeitem', { name: 'Home', exact: true }).click();
  await desktopWindow.getByRole('treeitem', { name: TOPIC_TITLE }).click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Add to Virtual Folder…|添加到虚拟文件夹\.\.\.)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /^(Add to Virtual Folder|添加到虚拟文件夹)$/ });
  await expect(dialog.getByRole('button', { name: FOLDER_TITLE })).toBeVisible();
  await desktopWindow.keyboard.press('Escape');

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect(desktopWindow.getByRole('treeitem', { name: FOLDER_TITLE })).toBeVisible();
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('virtual-folder-creation', { contentType: 'image/png', path: SCREENSHOT_PATH });
});
