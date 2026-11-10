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

  const nodeA = desktopWindow.getByRole('treeitem', { name: 'Playwright Switch Node A', exact: true });
  const nodeB = desktopWindow.getByRole('treeitem', { name: 'Playwright Switch Node B', exact: true });
  await expect(nodeA).toHaveAttribute('aria-selected', 'true');
  const beforeSwitch = await scrollActivePromptEditor(desktopWindow);
  await testInfo.attach('node-switch-before', {
    body: JSON.stringify(beforeSwitch, null, 2),
    contentType: 'application/json'
  });

  expect(beforeSwitch.scrollTop).toBeGreaterThan(0);

  await nodeB.click();
  await nodeA.click();

  await expect(nodeA).toHaveAttribute('aria-selected', 'true');
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

async function readingLine(page: Page) {
  return page.locator('.prompt-editor-host .cm-scroller').evaluate(scroller => {
    const viewport = scroller.getBoundingClientRect();
    const readingY = viewport.top + viewport.height * 0.15;
    const line = Array.from(scroller.querySelectorAll('.cm-line')).find(element => {
      const rect = element.getBoundingClientRect();
      return rect.top <= readingY && readingY < rect.bottom;
    });
    return Number(line?.textContent?.match(/^Line (\d+)/)?.[1] ?? 0);
  });
}

test('restores the same passage after reflow and keeps the last position after scrolling back', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedNodeSwitchWorkspace(desktopWindow);
  const nodeA = desktopWindow.getByRole('treeitem', { name: 'Playwright Switch Node A', exact: true });
  const nodeB = desktopWindow.getByRole('treeitem', { name: 'Playwright Switch Node B', exact: true });
  const scroller = desktopWindow.locator('.prompt-editor-host .cm-scroller');

  await scroller.hover();
  await desktopWindow.mouse.wheel(0, 3500);
  await expect.poll(() => readingLine(desktopWindow)).toBeGreaterThan(80);
  const originalLine = await readingLine(desktopWindow);
  await nodeB.click();
  await desktopWindow.addStyleTag({ content: '.prompt-editor-host .cm-content { max-width: 240px; }' });
  await nodeA.click();
  await expect.poll(async () => Math.abs(await readingLine(desktopWindow) - originalLine)).toBeLessThanOrEqual(1);

  await scroller.hover();
  await desktopWindow.mouse.wheel(0, -1800);
  await expect.poll(() => readingLine(desktopWindow)).toBeLessThan(originalLine - 5);
  const earlierLine = await readingLine(desktopWindow);
  expect(earlierLine).toBeGreaterThan(0);
  await nodeB.click();
  await nodeA.click();
  await expect.poll(async () => Math.abs(await readingLine(desktopWindow) - earlierLine)).toBeLessThanOrEqual(1);
});
