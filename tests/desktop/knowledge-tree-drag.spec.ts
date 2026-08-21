import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ACCEPTED_SCREENSHOT_PATH = path.resolve(
  '.tmp/artifacts/desktop-acceptance/knowledge-tree-drag-accepted.png'
);
const REJECTED_SCREENSHOT_PATH = path.resolve(
  '.tmp/artifacts/desktop-acceptance/knowledge-tree-drag-rejected.png'
);
const GENERATED_CHAPTER_ID = 'node-epub-abcdef0123456789abcdef01';

async function beginRowDrag(page: Page, source: Locator, target: Locator, targetYRatio: number) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('missing knowledge tree row bounds');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y - 8, { steps: 4 });
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height * targetYRatio,
    { steps: 8 }
  );
}

async function expectParent(page: Page, nodeId: string, parentNodeId: string) {
  await expect.poll(() => page.evaluate((id) => (
    window.__folioleWorkspaceDebug?.getNode?.(id)?.parentNodeId ?? null
  ), nodeId)).toBe(parentNodeId);
}

async function seedKnowledgeTree(page: Page) {
  await page.evaluate(async (chapterId) => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { content: '', id: 'tree-drag-folder', kind: 'folder', title: 'Tree drag folder' },
      {
        content: 'Target body', id: 'tree-drag-target', kind: 'topic',
        parentNodeId: 'tree-drag-folder', title: 'Tree drag target'
      },
      ...['A', 'B'].map((suffix) => ({
        content: `Source ${suffix}`, id: `tree-drag-source-${suffix.toLowerCase()}`, kind: 'topic' as const,
        parentNodeId: 'tree-drag-folder', title: `Tree drag source ${suffix}`
      })),
      {
        anchorLink: {
          id: 'anchor-1', kind: 'highlight' as const,
          locator: { from: 0, originalText: 'Anchored', to: 8 }
        },
        content: 'Anchored body', id: 'tree-drag-anchor', kind: 'topic',
        parentNodeId: 'tree-drag-folder', title: 'Tree drag anchored Topic'
      },
      {
        content: 'Imported chapter', id: chapterId, kind: 'topic',
        parentNodeId: 'tree-drag-folder', title: 'Tree drag EPUB chapter'
      }
    ], { persist: false });
  }, GENERATED_CHAPTER_ID);
}

test('shows only executable knowledge-tree drops with identical Alt behavior', async ({
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedKnowledgeTree(desktopWindow);

  await desktopWindow.getByRole('treeitem', { name: 'Tree drag folder' }).click();
  const column = desktopWindow.getByRole('complementary', {
    name: /^(Current folder contents|当前文件夹内容)$/
  });
  const frame = (name: string) => column.getByRole('treeitem', { name }).locator('..');
  const target = frame('Tree drag target');
  const sourceA = frame('Tree drag source A');
  const sourceB = frame('Tree drag source B');
  const anchoredTarget = frame('Tree drag anchored Topic');
  await expect(frame('Tree drag EPUB chapter')).toHaveAttribute('draggable', 'false');

  await beginRowDrag(desktopWindow, sourceA, target, 0.5);
  await expect(target).toHaveAttribute('data-drop-intent', 'child');
  await mkdir(path.dirname(ACCEPTED_SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: ACCEPTED_SCREENSHOT_PATH });
  await desktopWindow.mouse.up();
  await expectParent(desktopWindow, 'tree-drag-source-a', 'tree-drag-target');

  await desktopWindow.keyboard.down('Alt');
  await beginRowDrag(desktopWindow, sourceB, target, 0.5);
  await expect(target).toHaveAttribute('data-drop-intent', 'child');
  await desktopWindow.mouse.up();
  await desktopWindow.keyboard.up('Alt');
  await expectParent(desktopWindow, 'tree-drag-source-b', 'tree-drag-target');

  await beginRowDrag(desktopWindow, target, frame('Tree drag source A'), 0.5);
  await expect(frame('Tree drag source A')).not.toHaveAttribute('data-drop-intent');
  await desktopWindow.mouse.up();
  await expectParent(desktopWindow, 'tree-drag-target', 'tree-drag-folder');

  await beginRowDrag(desktopWindow, target, anchoredTarget, 0.5);
  await expect(anchoredTarget).not.toHaveAttribute('data-drop-intent');
  await desktopWindow.screenshot({ path: REJECTED_SCREENSHOT_PATH });
  await desktopWindow.mouse.up();
  await expectParent(desktopWindow, 'tree-drag-target', 'tree-drag-folder');

  await testInfo.attach('knowledge-tree-drag-accepted', {
    contentType: 'image/png', path: ACCEPTED_SCREENSHOT_PATH
  });
  await testInfo.attach('knowledge-tree-drag-rejected', {
    contentType: 'image/png', path: REJECTED_SCREENSHOT_PATH
  });
});
