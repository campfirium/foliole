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

async function seedChildDocumentWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Parent container',
        id: 'playwright-child-parent',
        kind: 'topic',
        title: 'Playwright Child Parent'
      },
      {
        content: 'Alpha Beta Gamma Delta',
        id: 'playwright-child-document',
        kind: 'topic',
        parentNodeId: 'playwright-child-parent',
        title: 'Playwright Child Document'
      }
    ]);
    await api?.openNode?.('playwright-child-document');
  });
}

async function seedLongChildDocumentWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const lines = Array.from(
      { length: 240 },
      (_, index) => `Line ${index + 1} keeps stretching the child document for highlight panel jump checks.`
    );
    const targetText = 'ChildDocumentJumpNeedle';
    lines.splice(180, 0, `Focused paragraph carries ${targetText} deep in the child document.`);
    await api?.seedNodes?.([
      {
        content: 'Parent container',
        id: 'playwright-long-child-parent',
        kind: 'topic',
        title: 'Playwright Long Child Parent'
      },
      {
        content: lines.join('\n'),
        id: 'playwright-long-child-document',
        kind: 'topic',
        parentNodeId: 'playwright-long-child-parent',
        title: 'Playwright Long Child Document'
      }
    ]);
    await api?.openNode?.('playwright-long-child-document');
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

async function clickHighlightsPanelItem(desktopWindow: Page, titleFragment: string) {
  return desktopWindow.evaluate((targetText) => {
    const button = Array.from(document.querySelectorAll('[aria-label="Document highlights"] button')).find((node) =>
      (node.textContent ?? '').includes(targetText)
    ) as HTMLButtonElement | undefined;
    if (!button) {
      throw new Error(`missing highlights panel item ${targetText}`);
    }
    button.click();
  }, titleFragment);
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

test('jumps to a context-menu-created highlight from the highlights panel while staying in the parent document', async ({ desktopWindow }, testInfo) => {
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

  await desktopWindow.getByRole('button', { name: 'Highlights panel' }).click();
  await clickHighlightsPanelItem(desktopWindow, 'Beta');

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  }).toBe('playwright-text-anchor-parent');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for context-menu-created highlight panel jump to reveal the text range'
  }).toMatchObject({
    selection: {
      from: 6,
      to: 10
    },
    selectedText: 'Beta'
  });

  await testInfo.attach('context-menu-highlight-panel-selection', {
    body: JSON.stringify(await collectPromptEditorSelection(desktopWindow), null, 2),
    contentType: 'application/json'
  });
});

test('jumps to a context-menu-created highlight from the highlights panel while staying in a child document', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedChildDocumentWorkspace(desktopWindow);

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

  await desktopWindow.getByRole('button', { name: 'Highlights panel' }).click();
  await clickHighlightsPanelItem(desktopWindow, 'Beta');

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  }).toBe('playwright-child-document');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for child-document highlight panel jump to reveal the text range'
  }).toMatchObject({
    selection: {
      from: 6,
      to: 10
    },
    selectedText: 'Beta'
  });

  await testInfo.attach('child-document-highlight-panel-selection', {
    body: JSON.stringify(await collectPromptEditorSelection(desktopWindow), null, 2),
    contentType: 'application/json'
  });
});

test('scrolls to a deep context-menu-created highlight from the highlights panel while staying in a child document', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedLongChildDocumentWorkspace(desktopWindow);

  const needlePosition = await desktopWindow.evaluate(() => {
    const content = globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? '';
    return content.indexOf('ChildDocumentJumpNeedle');
  });
  expect(needlePosition).toBeGreaterThan(0);

  await desktopWindow.evaluate((from) => {
    return globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', from, from + 'ChildDocumentJumpNeedle'.length) ?? false;
  }, needlePosition);

  await desktopWindow.locator('.prompt-editor-host .cm-content').click({
    button: 'right',
    position: { x: 120, y: 20 }
  });
  await desktopWindow.getByRole('menuitem', { name: 'Highlight' }).click();

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => {
      const nodes = globalThis.window?.__folioleWorkspaceDebug?.listNodes?.() ?? [];
      return nodes.filter((node) => node.title === 'ChildDocumentJumpNeedle').length;
    });
  }).toBeGreaterThan(0);

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

  await desktopWindow.getByRole('button', { name: 'Highlights panel' }).click();
  await clickHighlightsPanelItem(desktopWindow, 'ChildDocumentJumpNeedle');

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  }).toBe('playwright-long-child-document');

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for long child-document highlight panel jump to reveal the text range'
  }).toMatchObject({
    selectedText: 'ChildDocumentJumpNeedle',
    selection: {
      from: needlePosition,
      to: needlePosition + 'ChildDocumentJumpNeedle'.length
    }
  });

  const finalPromptState = await collectPromptEditorSelection(desktopWindow);
  await testInfo.attach('long-child-document-highlight-panel-selection', {
    body: JSON.stringify(finalPromptState, null, 2),
    contentType: 'application/json'
  });
  expect(finalPromptState.scrollTop).toBeGreaterThan(0);
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
