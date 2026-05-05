import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const TARGET_HIGHLIGHT_TEXT = '你提到的一些 GTD 元素你没用过';

test('shows imported highlights inside the GTD article editor', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);

  await desktopWindow.getByRole('treeitem', { name: /GTD 项目管理方法/ }).first().click();
  await expect(desktopWindow.getByRole('button', { name: 'GTD 项目管理方法', exact: true })).toBeVisible();

  const revealResult = await desktopWindow.evaluate(async (targetText) => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const activeNode = snapshot?.activeNodeId ? snapshot.nodesById?.[snapshot.activeNodeId] : null;
    const activeContent = typeof activeNode?.content === 'string' ? activeNode.content : '';
    const targetIndex = activeContent.indexOf(targetText);
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller');
    const content = document.querySelector('.prompt-editor-host .cm-content');
    const firstLine = document.querySelector('.prompt-editor-host .cm-line');
    if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement) || !(firstLine instanceof HTMLElement)) {
      return { found: false, reason: 'missing-editor' };
    }
    if (targetIndex < 0) {
      return { found: false, reason: 'target-not-in-active-content' };
    }

    const targetLine = activeContent.slice(0, targetIndex).split('\n').length - 1;
    const lineHeight = Math.max(firstLine.getBoundingClientRect().height, 20);
    const baseScrollTop = Math.max(0, targetLine * lineHeight - scroller.clientHeight / 3);
    const attempts = Array.from({ length: 9 }, (_, index) => baseScrollTop + (index - 4) * lineHeight * 4)
      .map((value) => Math.max(0, Math.min(value, scroller.scrollHeight)));

    for (const nextScrollTop of attempts) {
      scroller.scrollTop = nextScrollTop;
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      if ((content.textContent ?? '').includes(targetText)) {
        return {
          found: true,
          lineHeight,
          scrollTop: scroller.scrollTop,
          targetLine
        };
      }
    }

    return {
      found: false,
      reason: 'target-not-visible',
      scrollTop: scroller.scrollTop,
      targetLine,
      visibleText: content.textContent ?? ''
    };
  }, TARGET_HIGHLIGHT_TEXT);

  expect(revealResult.found).toBe(true);

  const diagnostics = await desktopWindow.evaluate((targetText) => {
    const visibleHighlights = Array.from(
      document.querySelectorAll('.prompt-editor-host .cm-md-highlight, .prompt-editor-host .cm-md-highlight-overlap')
    ).map((node) => (node.textContent ?? '').trim());
    return {
      matchingHighlightTexts: visibleHighlights.filter((text) => text.includes(targetText)),
      matchingSourceTexts: Array.from(document.querySelectorAll('.prompt-editor-host .cm-line'))
        .map((node) => (node.textContent ?? '').trim())
        .filter((text) => text.includes(targetText))
    };
  }, TARGET_HIGHLIGHT_TEXT);

  expect(diagnostics.matchingSourceTexts.length).toBeGreaterThan(0);
  expect(diagnostics.matchingHighlightTexts.length).toBeGreaterThan(0);
});
