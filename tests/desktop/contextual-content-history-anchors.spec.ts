import process from 'node:process';

import type { Page } from '@playwright/test';

import {
  collectNode,
  focusEditor,
  openNode,
  redoShortcut,
  undoShortcut
} from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const TEXT_TOPIC_ID = 'playwright-content-history-anchor-topic';
const TEXT_CONTENT = '123456789';

async function selectEditorRange(page: Page, from: number, to: number) {
  await expect.poll(() => page.evaluate(([start, end]) => (
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', start, end) ?? false
  ), [from, to])).toBe(true);
}

async function createSelectionAnnotation(page: Page, from: number, to: number, action: 'Cloze' | 'Highlight') {
  await selectEditorRange(page, from, to);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const dialog = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await expect(dialog).toBeVisible();
  const commandSelector = action === 'Cloze'
    ? 'button[aria-label="Cloze Selection"], button[aria-label="挖空所选内容"]'
    : 'button[aria-label="Highlight Selection"], button[aria-label="高亮所选内容"]';
  await dialog.locator(commandSelector).click();
  await expect(dialog).toBeHidden();
}

async function collectRenderedAnchors(page: Page) {
  return page.evaluate(() => ({
    clozes: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-cloze'))
      .map((element) => element.textContent ?? ''),
    content: window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null,
    highlights: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-highlight'))
      .map((element) => element.textContent ?? '')
  }));
}

async function collectAnchorNodes(page: Page) {
  return page.evaluate(() => (
    window.__folioleWorkspaceDebug?.listNodes?.()
      .map(({ id }) => window.__folioleWorkspaceDebug?.getNode?.(id))
      .filter((node) => Boolean(node?.anchorLink))
      .map((node) => ({ anchorLink: node?.anchorLink, id: node?.id, trashed: node?.trashed ?? false })) ?? []
  ));
}

test('keeps exact text anchor positions through interleaved undo and redo', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async ({ content, id }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{ content, id, kind: 'topic', title: 'Anchor History' }]);
  }, { content: TEXT_CONTENT, id: TEXT_TOPIC_ID });
  await openNode(desktopWindow, TEXT_TOPIC_ID);

  await createSelectionAnnotation(desktopWindow, 2, 3, 'Highlight');
  await createSelectionAnnotation(desktopWindow, 8, 9, 'Cloze');
  await expect.poll(() => collectRenderedAnchors(desktopWindow)).toEqual({
    clozes: ['9'],
    content: TEXT_CONTENT,
    highlights: ['3']
  });
  const originalNodes = await collectAnchorNodes(desktopWindow);
  expect(originalNodes).toHaveLength(2);

  await focusEditor(desktopWindow);
  await desktopWindow.keyboard.press(undoShortcut());
  await desktopWindow.keyboard.press(undoShortcut());
  await expect.poll(() => collectRenderedAnchors(desktopWindow)).toEqual({
    clozes: [],
    content: TEXT_CONTENT,
    highlights: []
  });

  await desktopWindow.keyboard.press(redoShortcut());
  await desktopWindow.keyboard.press(redoShortcut());
  await expect.poll(() => collectRenderedAnchors(desktopWindow)).toEqual({
    clozes: ['9'],
    content: TEXT_CONTENT,
    highlights: ['3']
  });
  expect(await collectAnchorNodes(desktopWindow)).toEqual(originalNodes);
  await expect.poll(() => collectNode(desktopWindow, TEXT_TOPIC_ID)).toMatchObject({ content: TEXT_CONTENT });
});
