import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedTextAnchorWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Alpha Beta Gamma Delta',
        id: 'playwright-text-anchor-parent',
        kind: 'topic',
        title: 'Playwright Text Anchor Parent'
      }
    ]);
    await api?.createTextHighlightChild?.({
      anchorId: 'hl-playwright-1',
      anchorLink: {
        id: 'hl-playwright-1',
        kind: 'highlight',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      parentNodeId: 'playwright-text-anchor-parent',
      text: 'Beta'
    });
    await api?.createTextClozeChild?.({
      anchorId: 'cloze-playwright-1',
      anchorLink: {
        id: 'cloze-playwright-1',
        kind: 'cloze',
        locator: {
          ranges: [
            { from: 0, originalText: 'Alpha', to: 5 },
            { from: 11, originalText: 'Gamma', to: 16 }
          ]
        }
      },
      answer: 'Alpha\nGamma',
      parentNodeId: 'playwright-text-anchor-parent',
      prompt: '[...] Beta [...] Delta'
    });
    await api?.openNode?.('playwright-text-anchor-parent');
  });
}

async function collectTextAnchorState(desktopWindow: Page) {
  return desktopWindow.evaluate(() => ({
    activeNodeId: globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null,
    clozeTexts: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-cloze')).map((node) => (node.textContent ?? '').trim()).filter(Boolean),
    highlightTexts: Array.from(document.querySelectorAll('.prompt-editor-host .cm-md-highlight, .prompt-editor-host .cm-md-highlight-overlap'))
      .map((node) => (node.textContent ?? '').trim())
      .filter(Boolean),
    sidebarTexts: Array.from(document.querySelectorAll('[aria-label="Document highlights"] button'))
      .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }));
}

test('renders text highlights and multi-range clozes in the parent document and sidebar', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTextAnchorWorkspace(desktopWindow);

  await expect(desktopWindow.getByRole('button', { name: 'Playwright Text Anchor Parent', exact: true })).toBeVisible();
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-highlight')).toContainText('Beta');

  const state = await collectTextAnchorState(desktopWindow);
  await testInfo.attach('text-anchor-render-state', {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json'
  });

  expect(state.highlightTexts).toEqual(expect.arrayContaining(['Beta']));
  expect(state.clozeTexts.some((text) => text.includes('Alpha'))).toBe(true);
  expect(state.clozeTexts.some((text) => text.includes('Gamma'))).toBe(true);
  expect(state.activeNodeId).toBe('playwright-text-anchor-parent');
});

test('keeps breadcrumb return stable for a multi-range cloze child', async ({ desktopWindow }, testInfo) => {
  const pageErrors: string[] = [];
  desktopWindow.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await expectWorkspaceShell(desktopWindow);
  await seedTextAnchorWorkspace(desktopWindow);

  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const target = api?.listNodes?.().find((node) => node.title === '[...] Beta [...] Delta') ?? null;
    if (!target) {
      throw new Error('missing cloze child');
    }
    await api?.openNode?.(target.id);
  });

  await expect(desktopWindow.getByRole('button', { name: '[...] Beta [...] Delta', exact: true })).toBeVisible();
  await desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' })
    .getByRole('button', { name: 'Playwright Text Anchor Parent' })
    .click();

  const state = await collectTextAnchorState(desktopWindow);
  await testInfo.attach('text-anchor-breadcrumb-return-state', {
    body: JSON.stringify({ pageErrors, state }, null, 2),
    contentType: 'application/json'
  });

  expect(pageErrors).toEqual([]);
  expect(state.highlightTexts).toEqual(expect.arrayContaining(['Beta']));
  expect(state.clozeTexts).toEqual(expect.arrayContaining(['Alpha', 'Gamma']));
});

test('keeps text anchors visible after the parent content shifts forward', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTextAnchorWorkspace(desktopWindow);

  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.updateNodeContent?.('playwright-text-anchor-parent', 'Start Alpha Beta Gamma Delta');
    await api?.openNode?.('playwright-text-anchor-parent');
  });

  await desktopWindow.waitForFunction(() => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return api?.getActiveNodeId?.() === 'playwright-text-anchor-parent';
  });

  const state = await collectTextAnchorState(desktopWindow);
  await testInfo.attach('text-anchor-after-parent-shift-state', {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json'
  });

  expect(state.highlightTexts).toEqual(expect.arrayContaining(['Beta']));
  expect(state.clozeTexts.some((text) => text.includes('Alpha'))).toBe(true);
  expect(state.clozeTexts.some((text) => text.includes('Gamma'))).toBe(true);
  expect(state.activeNodeId).toBe('playwright-text-anchor-parent');
});
