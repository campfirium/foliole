import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedHighlightsPanelWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Alpha Beta Gamma Delta',
        id: 'playwright-highlights-root',
        kind: 'topic',
        title: 'Playwright Highlights Root'
      },
      {
        content: 'Alpha Beta Gamma Delta',
        id: 'playwright-highlights-parent',
        kind: 'topic',
        parentNodeId: 'playwright-highlights-root',
        title: 'Playwright Highlights Parent'
      },
      {
        anchorLink: {
          id: 'playwright-highlights-anchor',
          kind: 'highlight',
          locator: {
            from: 6,
            originalText: 'Beta',
            to: 10
          }
        },
        content: 'Beta',
        id: 'playwright-highlights-child',
        kind: 'topic',
        parentNodeId: 'playwright-highlights-parent',
        title: 'Playwright Highlights Child'
      }
    ]);

    await api?.openNode?.('playwright-highlights-parent');
  });
}

async function collectPromptSelection(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const debugApi = globalThis.window?.__folioleDebug;
    const content = debugApi?.getEditorContent?.('prompt-editor') ?? '';
    const selection = debugApi?.getEditorSelection?.('prompt-editor') ?? null;
    return {
      selection,
      selectedText:
        selection && typeof selection.from === 'number' && typeof selection.to === 'number'
          ? content.slice(selection.from, selection.to)
          : ''
    };
  });
}

async function collectHighlightsPanelJumpDebug(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const workspace = globalThis.window?.__folioleWorkspaceDebug;
    const debugApi = globalThis.window?.__folioleDebug;
    return {
      activeNodeId: workspace?.getActiveNodeId?.() ?? null,
      childNode: workspace?.getNode?.('playwright-highlights-child') ?? null,
      childViewState: workspace?.getNodeViewState?.('playwright-highlights-child') ?? null,
      rootViewState: workspace?.getNodeViewState?.('playwright-highlights-root') ?? null,
      parentNode: workspace?.getNode?.('playwright-highlights-parent') ?? null,
      parentViewState: workspace?.getNodeViewState?.('playwright-highlights-parent') ?? null,
      promptSelection: debugApi?.getEditorSelection?.('prompt-editor') ?? null,
      traces:
        debugApi
          ?.getTraces?.()
          ?.filter((entry) => {
            const event = typeof entry?.event === 'string' ? entry.event : '';
            return event.includes('reading') || event.includes('restore-selection') || event.includes('reveal-anchor');
          })
          .slice(-40) ?? []
    };
  });
}

test('clicking a highlights panel item jumps within the current parent document to the highlight range', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedHighlightsPanelWorkspace(desktopWindow);

  await expect(desktopWindow.getByRole('button', { name: 'Playwright Highlights Parent', exact: true })).toBeVisible();
  const beforeClickSelection = await collectPromptSelection(desktopWindow);
  await testInfo.attach('highlights-panel-before-click-selection', {
    body: JSON.stringify(beforeClickSelection, null, 2),
    contentType: 'application/json'
  });
  await desktopWindow.getByRole('button', { name: 'Highlights panel' }).click();
  await expect(desktopWindow.getByRole('button', { name: 'Highlight Playwright Highlights Child' })).toBeVisible();
  await desktopWindow.getByRole('button', { name: 'Highlight Playwright Highlights Child' }).click();

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  }).toBe('playwright-highlights-parent');

  const debugState = await collectHighlightsPanelJumpDebug(desktopWindow);
  console.log('highlights-panel-jump-debug', JSON.stringify(debugState));
  await testInfo.attach('highlights-panel-jump-debug', {
    body: JSON.stringify(debugState, null, 2),
    contentType: 'application/json'
  });

  await expect.poll(async () => {
    const state = await collectPromptSelection(desktopWindow);
    return {
      caretAtTarget: state.selection?.from === 6 && state.selection?.to === 6,
      selectedText: state.selectedText
    };
  }, {
    message: 'waiting for highlights panel jump to land on the target position without leaving the text selected'
  }).toEqual({
    caretAtTarget: true,
    selectedText: ''
  });

  const finalSelection = await collectPromptSelection(desktopWindow);
  await testInfo.attach('highlights-panel-jump-selection', {
    body: JSON.stringify(finalSelection, null, 2),
    contentType: 'application/json'
  });
});
