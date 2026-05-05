import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedNodeSwitchWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const longLines = Array.from(
      { length: 260 },
      (_, index) => `Line ${index + 1} keeps the reading position test document long enough to scroll meaningfully.`
    );
    await api?.seedNodes?.([
      {
        content: longLines.join('\n'),
        id: 'playwright-switch-node-a',
        kind: 'topic',
        title: 'Playwright Switch Node A'
      },
      {
        content: 'Short sibling document',
        id: 'playwright-switch-node-b',
        kind: 'topic',
        title: 'Playwright Switch Node B'
      }
    ]);
    await api?.openNode?.('playwright-switch-node-a');
  });
}

async function scrollActivePromptEditor(desktopWindow: Page) {
  return desktopWindow.evaluate(async () => {
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    if (!(scroller instanceof HTMLElement)) {
      return { reason: 'missing-scroller' };
    }
    scroller.scrollTop = Math.max(0, scroller.scrollHeight * 0.72);
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1200));
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      nodeViewState: api?.getNodeViewState?.('playwright-switch-node-a') ?? null,
      scrollTop: scroller.scrollTop
    };
  });
}

async function collectPromptState(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const debugApi = globalThis.window?.__folioleDebug;
    return {
      scrollTop: debugApi?.getEditorScrollTop?.('prompt-editor') ?? null,
      selection: debugApi?.getEditorSelection?.('prompt-editor') ?? null
    };
  });
}

test('restores reading position after switching away and back', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedNodeSwitchWorkspace(desktopWindow);

  await expect(desktopWindow.getByRole('button', { name: 'Playwright Switch Node A', exact: true })).toBeVisible();
  const beforeSwitch = await scrollActivePromptEditor(desktopWindow);
  await testInfo.attach('node-switch-before', {
    body: JSON.stringify(beforeSwitch, null, 2),
    contentType: 'application/json'
  });

  expect(beforeSwitch.scrollTop).toBeGreaterThan(0);
  expect(beforeSwitch.nodeViewState?.scrollTop).toBeGreaterThan(0);

  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.openNode?.('playwright-switch-node-b');
    await api?.openNode?.('playwright-switch-node-a');
  });

  await expect(desktopWindow.getByRole('button', { name: 'Playwright Switch Node A', exact: true })).toBeVisible();
  await desktopWindow.waitForTimeout(800);

  const afterSwitch = await collectPromptState(desktopWindow);
  await testInfo.attach('node-switch-after', {
    body: JSON.stringify(afterSwitch, null, 2),
    contentType: 'application/json'
  });

  expect(afterSwitch.scrollTop).toBeGreaterThan(0);
  expect(afterSwitch.selection).toEqual({
    from: expect.any(Number),
    to: expect.any(Number)
  });
});
