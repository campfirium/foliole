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
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 10
        }
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
            {
              from: 0,
              originalText: 'Alpha',
              to: 5
            },
            {
              from: 11,
              originalText: 'Gamma',
              to: 16
            }
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

async function seedParentOnlyWorkspace(desktopWindow: Page) {
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

async function collectPromptEditorSelection(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const debugApi = globalThis.window?.__folioleDebug;
    const content = debugApi?.getEditorContent?.('prompt-editor') ?? '';
    const scrollTop = debugApi?.getEditorScrollTop?.('prompt-editor') ?? null;
    const selection = debugApi?.getEditorSelection?.('prompt-editor') ?? null;
    return {
      content,
      scrollTop,
      selectedText:
        selection && typeof selection.from === 'number' && typeof selection.to === 'number'
          ? content.slice(selection.from, selection.to)
          : '',
      selection
    };
  });
}

async function collectNodeViewSelection(desktopWindow: Page, nodeTitle: string) {
  return desktopWindow.evaluate((title) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const target = api?.listNodes?.().find((node) => node.title === title) ?? null;
    return target ? api?.getNodeViewState?.(target.id)?.selection ?? null : null;
  }, nodeTitle);
}

async function seedLongTextAnchorWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const lines = Array.from({ length: 220 }, (_, index) => `Line ${index + 1} filler content keeps stretching the parent document for breadcrumb scroll checks.`);
    const targetText = 'BreadcrumbJumpNeedle';
    lines.splice(170, 0, `Focused paragraph carries ${targetText} deep in the document.`);
    const content = lines.join('\n');
    const from = content.indexOf(targetText);
    const to = from + targetText.length;

    await api?.seedNodes?.([
      {
        content,
        id: 'playwright-long-parent',
        kind: 'topic',
        title: 'Playwright Long Anchor Parent'
      }
    ]);

    await api?.createTextHighlightChild?.({
      anchorId: 'hl-playwright-long-1',
      anchorLink: {
        id: 'hl-playwright-long-1',
        kind: 'highlight',
        locator: {
          from,
          originalText: targetText,
          to
        }
      },
      parentNodeId: 'playwright-long-parent',
      text: targetText
    });

    await api?.setNodeViewState?.({
      from: 0,
      nodeId: 'playwright-long-parent',
      scrollTop: 0,
      to: 0
    });

    const child = api?.listNodes?.().find((node) => node.title === targetText) ?? null;
    if (!child) {
      throw new Error('missing long highlight child');
    }

    await api?.openNode?.(child.id);
  });
}

async function collectNodeListTitles(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="treeitem"]'))
      .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  });
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
    await api?.openNode?.('playwright-text-anchor-parent');
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

  await expect(desktopWindow.getByRole('button', { name: 'Playwright Text Anchor Parent', exact: true })).toBeVisible();
  await expect(desktopWindow.locator('.prompt-editor-host')).toBeVisible();

  const state = await collectTextAnchorState(desktopWindow);
  await testInfo.attach('text-anchor-breadcrumb-return-state', {
    body: JSON.stringify({ pageErrors, state }, null, 2),
    contentType: 'application/json'
  });

  expect(pageErrors).toEqual([]);
  expect(state.highlightTexts).toEqual(expect.arrayContaining(['Beta']));
  expect(state.clozeTexts).toEqual(expect.arrayContaining(['Alpha', 'Gamma']));
});

test('jumps to the stored highlight range when returning to the parent from a manual highlight child', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTextAnchorWorkspace(desktopWindow);

  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.setNodeViewState?.({
      from: 0,
      nodeId: 'playwright-text-anchor-parent',
      scrollTop: 0,
      to: 5
    });
    const target = api?.listNodes?.().find((node) => node.title === 'Beta') ?? null;
    if (!target) {
      throw new Error('missing highlight child');
    }
    await api?.openNode?.(target.id);
  });

  await expect(desktopWindow.getByRole('button', { name: 'Beta', exact: true })).toBeVisible();
  await desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' })
    .getByRole('button', { name: 'Playwright Text Anchor Parent' })
    .click();

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  }).toBe('playwright-text-anchor-parent');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for manual highlight breadcrumb return to stop selecting the text'
  }).toMatchObject({
    selectedText: ''
  });

  await expect.poll(async () => collectNodeViewSelection(desktopWindow, 'Playwright Text Anchor Parent')).toEqual({
    from: 6,
    to: 6
  });

  const promptSelection = await collectPromptEditorSelection(desktopWindow);
  await testInfo.attach('manual-highlight-breadcrumb-selection', {
    body: JSON.stringify(promptSelection, null, 2),
    contentType: 'application/json'
  });
});

test('keeps breadcrumb return correct after creating a normal text highlight from the context menu and then opening the child', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedParentOnlyWorkspace(desktopWindow);

  await desktopWindow.evaluate(() => {
    return globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 6, 10) ?? false;
  });

  await desktopWindow.locator('.prompt-editor-host .cm-content').click({
    button: 'right',
    position: { x: 120, y: 20 }
  });
  await desktopWindow.getByRole('menuitem', { name: 'Highlight' }).click();

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => {
      const nodes = globalThis.window?.__folioleWorkspaceDebug?.listNodes?.() ?? [];
      return nodes.filter((node) => node.title === 'Beta').length;
    });
  }).toBeGreaterThan(0);

  const nodeListTitles = await collectNodeListTitles(desktopWindow);
  await testInfo.attach('context-menu-highlight-node-list', {
    body: JSON.stringify(nodeListTitles, null, 2),
    contentType: 'application/json'
  });

  await desktopWindow.getByRole('treeitem', { name: 'Beta', exact: true }).click();
  await expect.poll(async () => {
    return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  }).not.toBe('playwright-text-anchor-parent');

  await desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' })
    .getByRole('button', { name: 'Playwright Text Anchor Parent' })
    .click();

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  }).toBe('playwright-text-anchor-parent');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for context-menu-created highlight to stop selecting the parent text'
  }).toMatchObject({
    selectedText: ''
  });

  await expect.poll(async () => collectNodeViewSelection(desktopWindow, 'Playwright Text Anchor Parent')).toEqual({
    from: 6,
    to: 6
  });

  const promptSelection = await collectPromptEditorSelection(desktopWindow);
  await testInfo.attach('context-menu-highlight-breadcrumb-selection', {
    body: JSON.stringify(promptSelection, null, 2),
    contentType: 'application/json'
  });
});

test('really scrolls to a deep text anchor when returning to the parent from breadcrumb', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedLongTextAnchorWorkspace(desktopWindow);

  await expect(desktopWindow.getByRole('button', { name: 'BreadcrumbJumpNeedle', exact: true })).toBeVisible();
  await desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' })
    .getByRole('button', { name: 'Playwright Long Anchor Parent' })
    .click();

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  }).toBe('playwright-long-parent');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for deep breadcrumb return to scroll to the anchor position'
  }).toMatchObject({
    selectedText: '',
    selection: {
      from: expect.any(Number),
      to: expect.any(Number)
    },
    scrollTop: expect.any(Number)
  });

  const promptSelection = await collectPromptEditorSelection(desktopWindow);
  await testInfo.attach('deep-breadcrumb-scroll-selection', {
    body: JSON.stringify(promptSelection, null, 2),
    contentType: 'application/json'
  });

  expect(promptSelection.scrollTop).toBeGreaterThan(400);
  expect(promptSelection.selection).toEqual({
    from: promptSelection.selection?.from,
    to: promptSelection.selection?.from
  });
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
  await expect(desktopWindow.locator('.prompt-editor-host')).toBeVisible();

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
