import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedLongTextAnchorWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const lines = Array.from({ length: 220 }, (_, index) => `Line ${index + 1} filler content keeps stretching the parent document for breadcrumb scroll checks.`);
    const targetText = 'BreadcrumbJumpNeedle';
    lines.splice(170, 0, `Focused paragraph carries ${targetText} deep in the document.`);
    const content = lines.join('\n');
    const from = content.indexOf(targetText);
    const to = from + targetText.length;

    await api?.seedNodes?.([{ content, id: 'playwright-long-parent', kind: 'topic', title: 'Playwright Long Anchor Parent' }]);
    await api?.createTextHighlightChild?.({
      anchorId: 'hl-playwright-long-1',
      anchorLink: { id: 'hl-playwright-long-1', kind: 'highlight', locator: { from, originalText: targetText, to } },
      parentNodeId: 'playwright-long-parent',
      text: targetText
    });
    await api?.setNodeViewState?.({ from: 0, nodeId: 'playwright-long-parent', scrollTop: 0, to: 0 });

    const child = api?.listNodes?.().find((node) => node.title === targetText) ?? null;
    if (!child) {
      throw new Error('missing long highlight child');
    }
    await api?.openNode?.(child.id);
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

async function collectPromptEditorAnchorViewport(desktopWindow: Page, position: number) {
  return desktopWindow.evaluate((from) => {
    const debugApi = globalThis.window?.__folioleDebug;
    const viewport = debugApi?.getEditorViewportRect?.('prompt-editor') ?? null;
    const top = debugApi?.getEditorPositionViewportTop?.('prompt-editor', from) ?? null;
    if (!viewport || typeof top !== 'number' || viewport.height <= 0) {
      return null;
    }
    return { ratio: (top - viewport.top) / viewport.height, top, viewport };
  }, position);
}

async function collectPromptEditorTimeline(desktopWindow: Page, durationMs = 420, intervalMs = 24) {
  return desktopWindow.evaluate(
    async ({ durationMs: duration, intervalMs: interval }) => {
      const debugApi = globalThis.window?.__folioleDebug;
      const workspaceApi = globalThis.window?.__folioleWorkspaceDebug;
      const start = performance.now();
      const samples: Array<{ activeNodeId: string | null; at: number; scrollTop: number | null; selection: { from: number; to: number } | null }> = [];

      while (performance.now() - start <= duration) {
        samples.push({
          activeNodeId: workspaceApi?.getActiveNodeId?.() ?? null,
          at: Math.round(performance.now() - start),
          scrollTop: debugApi?.getEditorScrollTop?.('prompt-editor') ?? null,
          selection: debugApi?.getEditorSelection?.('prompt-editor') ?? null
        });
        await new Promise((resolve) => window.setTimeout(resolve, interval));
      }

      return samples;
    },
    { durationMs, intervalMs }
  );
}

async function collectFilteredDebugTraces(desktopWindow: Page) {
  return desktopWindow.evaluate(() =>
    globalThis.window?.__folioleDebug
      ?.getTraces?.()
      ?.filter((entry) => {
        const event = typeof entry?.event === 'string' ? entry.event : '';
        return event.includes('select-node') || event.includes('reading-position') || event.includes('restore-selection') || event.includes('editor.viewport') || event.includes('align-selection');
      })
      .slice(-80) ?? []
  );
}

test('really scrolls to a deep text anchor when returning to the parent from breadcrumb', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedLongTextAnchorWorkspace(desktopWindow);

  const timelinePromise = collectPromptEditorTimeline(desktopWindow);
  await desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' })
    .getByRole('button', { name: 'Playwright Long Anchor Parent' })
    .click();

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for deep breadcrumb return to scroll to the anchor position'
  }).toMatchObject({
    selectedText: '',
    selection: { from: expect.any(Number), to: expect.any(Number) },
    scrollTop: expect.any(Number)
  });

  const promptSelection = await collectPromptEditorSelection(desktopWindow);
  expect(promptSelection.scrollTop).toBeGreaterThan(400);
  expect(promptSelection.selection).toEqual({
    from: promptSelection.selection?.from,
    to: promptSelection.selection?.from
  });

  await testInfo.attach('deep-breadcrumb-scroll-selection', {
    body: JSON.stringify(promptSelection, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('deep-breadcrumb-viewport-position', {
    body: JSON.stringify(await collectPromptEditorAnchorViewport(desktopWindow, promptSelection.selection?.from ?? 0), null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('deep-breadcrumb-scroll-timeline', {
    body: JSON.stringify(await timelinePromise, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('deep-breadcrumb-debug-traces', {
    body: JSON.stringify(await collectFilteredDebugTraces(desktopWindow), null, 2),
    contentType: 'application/json'
  });
});
