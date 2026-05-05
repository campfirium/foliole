import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedTextAnchorWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content: 'Alpha Beta Gamma Delta', id: 'playwright-text-anchor-parent', kind: 'topic', title: 'Playwright Text Anchor Parent' }]);
    await api?.createTextHighlightChild?.({
      anchorId: 'hl-playwright-1',
      anchorLink: { id: 'hl-playwright-1', kind: 'highlight', locator: { from: 6, originalText: 'Beta', to: 10 } },
      parentNodeId: 'playwright-text-anchor-parent',
      text: 'Beta'
    });
    await api?.openNode?.('playwright-text-anchor-parent');
  });
}

async function seedParentOnlyWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content: 'Alpha Beta Gamma Delta', id: 'playwright-text-anchor-parent', kind: 'topic', title: 'Playwright Text Anchor Parent' }]);
    await api?.openNode?.('playwright-text-anchor-parent');
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

async function collectNodeViewSelection(desktopWindow: Page, nodeTitle: string) {
  return desktopWindow.evaluate((title) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const target = api?.listNodes?.().find((node) => node.title === title) ?? null;
    return target ? api?.getNodeViewState?.(target.id)?.selection ?? null : null;
  }, nodeTitle);
}

async function collectNodeListTitles(desktopWindow: Page) {
  return desktopWindow.evaluate(() =>
    Array.from(document.querySelectorAll('[role="treeitem"]'))
      .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  );
}

test('jumps to the stored highlight range when returning to the parent from a manual highlight child', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTextAnchorWorkspace(desktopWindow);

  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.setNodeViewState?.({ from: 0, nodeId: 'playwright-text-anchor-parent', scrollTop: 0, to: 5 });
    const target = api?.listNodes?.().find((node) => node.title === 'Beta') ?? null;
    if (!target) {
      throw new Error('missing highlight child');
    }
    await api?.openNode?.(target.id);
  });

  await desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' })
    .getByRole('button', { name: 'Playwright Text Anchor Parent' })
    .click();

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for manual highlight breadcrumb return to stop selecting the text'
  }).toMatchObject({ selectedText: '' });

  await expect.poll(async () => collectNodeViewSelection(desktopWindow, 'Playwright Text Anchor Parent')).toEqual({
    from: 6,
    to: 6
  });

  await testInfo.attach('manual-highlight-breadcrumb-selection', {
    body: JSON.stringify(await collectPromptEditorSelection(desktopWindow), null, 2),
    contentType: 'application/json'
  });
});

test('keeps breadcrumb return correct after creating a normal text highlight from the context menu and then opening the child', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedParentOnlyWorkspace(desktopWindow);

  await desktopWindow.evaluate(() => globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 6, 10) ?? false);
  await desktopWindow.locator('.prompt-editor-host .cm-content').click({ button: 'right', position: { x: 120, y: 20 } });
  await desktopWindow.getByRole('menuitem', { name: 'Highlight' }).click();

  await expect.poll(async () => {
    return desktopWindow.evaluate(() => {
      const nodes = globalThis.window?.__folioleWorkspaceDebug?.listNodes?.() ?? [];
      return nodes.filter((node) => node.title === 'Beta').length;
    });
  }).toBeGreaterThan(0);

  await testInfo.attach('context-menu-highlight-node-list', {
    body: JSON.stringify(await collectNodeListTitles(desktopWindow), null, 2),
    contentType: 'application/json'
  });

  await desktopWindow.getByRole('treeitem', { name: 'Beta', exact: true }).click();
  await desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' })
    .getByRole('button', { name: 'Playwright Text Anchor Parent' })
    .click();

  await expect.poll(async () => collectPromptEditorSelection(desktopWindow), {
    message: 'waiting for context-menu-created highlight to stop selecting the parent text'
  }).toMatchObject({ selectedText: '' });

  await expect.poll(async () => collectNodeViewSelection(desktopWindow, 'Playwright Text Anchor Parent')).toEqual({
    from: 6,
    to: 6
  });

  await testInfo.attach('context-menu-highlight-breadcrumb-selection', {
    body: JSON.stringify(await collectPromptEditorSelection(desktopWindow), null, 2),
    contentType: 'application/json'
  });
});
