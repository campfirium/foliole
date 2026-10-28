import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedParentOnlyWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content: 'Alpha Beta Gamma Delta', id: 'playwright-text-anchor-parent', kind: 'topic', title: 'Playwright Text Anchor Parent' }]);
    await api?.openNode?.('playwright-text-anchor-parent');
  });
}

async function seedChildDocumentWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: 'Parent container', id: 'playwright-child-parent', kind: 'topic', title: 'Playwright Child Parent' },
      { content: 'Alpha Beta Gamma Delta', id: 'playwright-child-document', kind: 'topic', parentNodeId: 'playwright-child-parent', title: 'Playwright Child Document' }
    ]);
    await api?.openNode?.('playwright-child-document');
  });
}

async function seedLongChildDocumentWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const lines = Array.from({ length: 240 }, (_, index) => `Line ${index + 1} keeps stretching the child document for highlight panel jump checks.`);
    const targetText = 'ChildDocumentJumpNeedle';
    lines.splice(180, 0, `Focused paragraph carries ${targetText} deep in the child document.`);
    await api?.seedNodes?.([
      { content: 'Parent container', id: 'playwright-long-child-parent', kind: 'topic', title: 'Playwright Long Child Parent' },
      { content: lines.join('\n'), id: 'playwright-long-child-document', kind: 'topic', parentNodeId: 'playwright-long-child-parent', title: 'Playwright Long Child Document' }
    ]);
    await api?.openNode?.('playwright-long-child-document');
  });
}

async function collectPromptEditorSelection(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const debugApi = globalThis.window?.__folioleDebug;
    const content = debugApi?.getEditorContent?.('prompt-editor') ?? '';
    const scrollTop = debugApi?.getEditorScrollTop?.('prompt-editor') ?? null;
    const selection = debugApi?.getEditorSelection?.('prompt-editor') ?? null;
    return {
      scrollTop,
      selectedText:
        selection && typeof selection.from === 'number' && typeof selection.to === 'number'
          ? content.slice(selection.from, selection.to)
          : '',
      selection
    };
  });
}

async function clickHighlightsPanelItem(desktopWindow: Page, titleFragment: string) {
  await desktopWindow.getByRole('list', { name: /^(Document highlights|文档高亮)$/ })
    .getByRole('button').filter({ hasText: titleFragment }).click();
}

async function createSelectionHighlight(desktopWindow: Page, from: number, to: number) {
  await expect.poll(() => desktopWindow.evaluate(([start, end]) =>
    globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', start, end) ?? false,
  [from, to])).toBe(true);
  await desktopWindow.evaluate(() => {
    window.getSelection()?.anchorNode?.parentElement?.scrollIntoView({ block: 'center' });
  });
  await desktopWindow.locator('.prompt-editor-host .cm-content').evaluate((element) => {
    const rect = element.closest('.cm-scroller')!.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 0, clientX: rect.left + 120, clientY: rect.top + 20
    }));
  });
  await desktopWindow.locator('[data-annotation-toolbar="true"]')
    .getByRole('button', { name: /^(Highlight|高亮)$/ }).click();
}

test('jumps to a selection-created highlight from the highlights panel while staying in the parent document', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedParentOnlyWorkspace(desktopWindow);
  await createSelectionHighlight(desktopWindow, 6, 10);

  await desktopWindow.getByRole('button', { name: /^(Highlights panel|高亮面板)$/ }).click();
  await clickHighlightsPanelItem(desktopWindow, 'Beta');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for selection-created highlight panel jump to reveal the text range'
  }).toMatchObject({ selectedText: '', selection: { from: 6, to: 6 } });

  await testInfo.attach('selection-highlight-panel-selection', {
    body: JSON.stringify(await collectPromptEditorSelection(desktopWindow), null, 2),
    contentType: 'application/json'
  });
});

test('jumps to a selection-created highlight from the highlights panel while staying in a child document', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedChildDocumentWorkspace(desktopWindow);
  await createSelectionHighlight(desktopWindow, 6, 10);

  await desktopWindow.getByRole('button', { name: /^(Highlights panel|高亮面板)$/ }).click();
  await clickHighlightsPanelItem(desktopWindow, 'Beta');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for child-document highlight panel jump to reveal the text range'
  }).toMatchObject({ selectedText: '', selection: { from: 6, to: 6 } });

  await testInfo.attach('child-document-highlight-panel-selection', {
    body: JSON.stringify(await collectPromptEditorSelection(desktopWindow), null, 2),
    contentType: 'application/json'
  });
});

test('scrolls to a deep selection-created highlight from the highlights panel while staying in a child document', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedLongChildDocumentWorkspace(desktopWindow);

  const needlePosition = await desktopWindow.evaluate(() => {
    const content = globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? '';
    return content.indexOf('ChildDocumentJumpNeedle');
  });
  expect(needlePosition).toBeGreaterThan(0);

  await createSelectionHighlight(desktopWindow, needlePosition, needlePosition + 'ChildDocumentJumpNeedle'.length);
  await desktopWindow.evaluate(() => {
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    if (!scroller) {
      return null;
    }
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    return scroller.scrollTop;
  });
  await desktopWindow.waitForTimeout(200);

  await desktopWindow.getByRole('button', { name: /^(Highlights panel|高亮面板)$/ }).click();
  await clickHighlightsPanelItem(desktopWindow, 'ChildDocumentJumpNeedle');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for long child-document highlight panel jump to reveal the text range'
  }).toMatchObject({ selectedText: '', selection: { from: needlePosition, to: needlePosition } });

  await testInfo.attach('long-child-document-highlight-panel-selection', {
    body: JSON.stringify(await collectPromptEditorSelection(desktopWindow), null, 2),
    contentType: 'application/json'
  });
});
