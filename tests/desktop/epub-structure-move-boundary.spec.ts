import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve(
  '.tmp/artifacts/desktop-acceptance/epub-structure-move-boundary.png'
);
const CHAPTER_ID = 'node-epub-0123456789abcdef01234567';

async function seedEpubStructure(desktopWindow: Parameters<typeof expectWorkspaceShell>[0]) {
  await desktopWindow.evaluate(async (chapterId) => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'epub-folder-a', kind: 'folder', title: 'EPUB Folder A' },
      { content: '', id: 'epub-folder-b', kind: 'folder', title: 'EPUB Folder B' },
      {
        content: 'Book body', id: 'epub-book-root', kind: 'topic',
        parentNodeId: 'epub-folder-a', title: 'EPUB Book Root'
      },
      {
        content: 'Imported chapter body', id: chapterId, kind: 'topic',
        parentNodeId: 'epub-book-root', title: 'Imported EPUB Chapter'
      },
      {
        content: 'User note body', id: 'epub-user-note', kind: 'topic',
        parentNodeId: 'epub-book-root', title: 'User Note Under Book'
      }
    ]);
  }, CHAPTER_ID);
}

test('keeps the EPUB book movable without detaching generated chapters', async ({
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedEpubStructure(desktopWindow);

  await desktopWindow.getByRole('treeitem', { name: 'EPUB Folder A' }).click();
  const topicPanel = desktopWindow.getByRole('complementary', {
    name: /^(Current folder contents|当前文件夹内容)$/
  });
  await topicPanel.getByRole('button', { name: /^(Expand all topics|展开全部主题)$/ }).click();
  const bookFrame = topicPanel.getByRole('treeitem', { name: 'EPUB Book Root' }).locator('..');
  const chapterFrame = topicPanel.getByRole('treeitem', { name: 'Imported EPUB Chapter' }).locator('..');
  const userNoteFrame = topicPanel.getByRole('treeitem', { name: 'User Note Under Book' }).locator('..');

  await expect(bookFrame).toHaveAttribute('draggable', 'true');
  await expect(chapterFrame).toHaveAttribute('draggable', 'false');
  await expect(userNoteFrame).toHaveAttribute('draggable', 'true');
  await chapterFrame.click({ button: 'right' });
  await expect(desktopWindow.getByRole('menuitem', { name: /^(Move to…|移动到\.\.\.)$/ })).toHaveCount(0);
  await desktopWindow.keyboard.press('Escape');

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('epub-structure-move-boundary', {
    contentType: 'image/png',
    path: SCREENSHOT_PATH
  });

  const result = await desktopWindow.evaluate(async (chapterId) => {
    const debug = window.__folioleWorkspaceDebug;
    const chapterMoved = await debug?.moveNodes([chapterId], 'epub-folder-b', 'child');
    const bookMoved = await debug?.moveNodes(['epub-book-root'], 'epub-folder-b', 'child');
    const userNoteMoved = await debug?.moveNodes(['epub-user-note'], 'epub-folder-b', 'child');
    return {
      bookMoved,
      bookParentId: debug?.getNode('epub-book-root')?.parentNodeId,
      chapterMoved,
      chapterParentId: debug?.getNode(chapterId)?.parentNodeId,
      userNoteMoved,
      userNoteParentId: debug?.getNode('epub-user-note')?.parentNodeId
    };
  }, CHAPTER_ID);

  expect(result).toEqual({
    bookMoved: true,
    bookParentId: 'epub-folder-b',
    chapterMoved: false,
    chapterParentId: 'epub-book-root',
    userNoteMoved: true,
    userNoteParentId: 'epub-folder-b'
  });
});
