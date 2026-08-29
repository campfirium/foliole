import process from 'node:process';

import {
  importPdfThroughRuntime,
  openNode,
  openPdfNode,
  selectPdfHighlightText
} from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ROOT_ID = 'four-way-root';
const CANONICAL_LAST_CHILD_ID = 'four-way-canonical-last-child';
const OTHER_CHILD_ID = 'four-way-other-child';

function shortcut(direction: 'Down' | 'Left' | 'Right' | 'Up') {
  if (process.platform === 'darwin') return `Meta+Arrow${direction}`;
  return direction === 'Left' || direction === 'Right'
    ? `Alt+Arrow${direction}`
    : `Control+Arrow${direction}`;
}

async function activeNodeId(page: Parameters<typeof openNode>[0]) {
  return page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
}

async function seedFourWayTree(page: Parameters<typeof openNode>[0]) {
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async ({ canonicalLastChildId, otherChildId, rootId }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { content: 'Root body', id: rootId, kind: 'topic', title: 'Four Way Root' },
      { content: 'Canonical last child body', id: canonicalLastChildId, kind: 'topic', parentNodeId: rootId, title: 'Canonical Last Child' },
      { content: 'Other child body', id: otherChildId, kind: 'topic', parentNodeId: rootId, title: 'Other Child' }
    ]);
  }, { canonicalLastChildId: CANONICAL_LAST_CHILD_ID, otherChildId: OTHER_CHILD_ID, rootId: ROOT_ID });
  await expect.poll(() => activeNodeId(page)).toBe(ROOT_ID);
}

test('four-way navigation saves title and body edits before structural and history moves', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedFourWayTree(desktopWindow);

  await desktopWindow.getByRole('button', { name: /Command Palette|命令面板/ }).click();
  await expect(desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ })).toBeVisible();
  await desktopWindow.keyboard.press(shortcut('Down'));
  await expect.poll(() => activeNodeId(desktopWindow)).toBe(ROOT_ID);
  await desktopWindow.keyboard.press('Escape');

  await desktopWindow.keyboard.press('F2');
  const titleInput = desktopWindow.locator('input[aria-label^="Rename "]');
  await expect(titleInput).toBeFocused();
  await titleInput.fill('Saved by Four Way Navigation');
  await desktopWindow.keyboard.press(shortcut('Down'));
  await expect.poll(() => activeNodeId(desktopWindow)).not.toBe(ROOT_ID);
  const titleNavigationTarget = await activeNodeId(desktopWindow);
  expect([CANONICAL_LAST_CHILD_ID, OTHER_CHILD_ID]).toContain(titleNavigationTarget);
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.title ?? null, ROOT_ID
  )).toBe('Saved by Four Way Navigation');

  await desktopWindow.keyboard.press(shortcut('Up'));
  await expect.poll(() => activeNodeId(desktopWindow)).toBe(ROOT_ID);
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await editor.click();
  await desktopWindow.keyboard.press('End');
  await desktopWindow.keyboard.insertText(' saved draft');
  await desktopWindow.keyboard.press(shortcut('Down'));
  await expect.poll(() => activeNodeId(desktopWindow)).not.toBe(ROOT_ID);
  const bodyNavigationTarget = await activeNodeId(desktopWindow);
  expect([CANONICAL_LAST_CHILD_ID, OTHER_CHILD_ID]).toContain(bodyNavigationTarget);
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.content ?? null, ROOT_ID
  )).toContain('saved draft');

  await desktopWindow.keyboard.press(shortcut('Up'));
  await expect.poll(() => activeNodeId(desktopWindow)).toBe(ROOT_ID);
  await desktopWindow.keyboard.press(shortcut('Left'));
  await expect.poll(() => activeNodeId(desktopWindow)).toBe(bodyNavigationTarget);
  await desktopWindow.keyboard.press(shortcut('Right'));
  await expect.poll(() => activeNodeId(desktopWindow)).toBe(ROOT_ID);
});

test('four-way history navigation works from PDF selection and restores its page', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  await seedFourWayTree(desktopWindow);
  const pdfNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);
  await openPdfNode(desktopWindow, pdfNodeId);
  const pageInput = desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await pageInput.fill('3');
  await pageInput.press('Enter');
  await expect(pageInput).toHaveValue('3');
  await expect(desktopWindow.getByRole('region', { name: /PDF reader panel|PDF 阅读器面板/ }))
    .toContainText('gamma keyword');
  await selectPdfHighlightText(desktopWindow);

  await desktopWindow.keyboard.press(shortcut('Left'));
  await expect.poll(() => activeNodeId(desktopWindow)).toBe(ROOT_ID);
  await desktopWindow.keyboard.press(shortcut('Right'));
  await expect.poll(() => activeNodeId(desktopWindow)).toBe(pdfNodeId);
  await expect(pageInput).toHaveValue('3');
});
