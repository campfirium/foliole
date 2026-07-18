import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const SOURCE_NODE_ID = 'playwright-search-jump-source';
const TARGET_NODE_ID = 'playwright-search-jump-target';
const TARGET_TITLE = 'Playwright Search Jump Target';
const NEEDLE = 'SearchJumpNeedleTarget';

async function seedSearchJumpWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(
    async ({ needle, sourceNodeId, targetNodeId, targetTitle }) => {
      const api = globalThis.window?.__folioleWorkspaceDebug;
      if (!api) {
        throw new Error('missing workspace debug bridge');
      }
      const lines = Array.from(
        { length: 220 },
        (_, index) => `Line ${index + 1} keeps the search jump target long enough to require scrolling.`
      );
      lines.splice(175, 0, `Deep paragraph contains ${needle} for workspace search jump verification.`);
      const content = lines.join('\n');
      await api.seedNodes([
        {
          content: 'Source document starts away from the search hit.',
          id: sourceNodeId,
          kind: 'topic',
          title: 'Playwright Search Jump Source'
        },
        {
          content,
          id: targetNodeId,
          kind: 'topic',
          title: targetTitle
        }
      ], { persist: true });
      await globalThis.window?.electronAPI?.invoke('update_node_content', {
        anchorLink: null,
        content,
        createdAt: '2026-04-08T00:00:00.000Z',
        desiredRetention: null,
        hideTitleHeading: false,
        imageRegions: null,
        isTitleManual: true,
        kind: 'topic',
        nodeId: targetNodeId,
        parentNodeId: null,
        position: 1,
        priority: null,
        reading: null,
        reveal: null,
        review: null,
        title: targetTitle,
        updatedAt: '2026-04-08T00:00:10.000Z',
        virtualFilter: null
      });
      await api.openNode(sourceNodeId);
    },
    { needle: NEEDLE, sourceNodeId: SOURCE_NODE_ID, targetNodeId: TARGET_NODE_ID, targetTitle: TARGET_TITLE }
  );
}

async function waitForWorkspaceSearchHit(desktopWindow: Page) {
  await expect
    .poll(
      () =>
        desktopWindow.evaluate(async ({ needle, targetNodeId }) => {
          const results = await globalThis.window?.electronAPI?.invoke('search_workspace', { query: needle });
          return (
            results?.find((result: { id?: string; nodeMatch?: { from: number; to: number } | null }) => result.id === targetNodeId)
              ?.nodeMatch ?? null
          );
        }, { needle: NEEDLE, targetNodeId: TARGET_NODE_ID }),
      { message: 'waiting for workspace search index to include the body hit', timeout: 15_000 }
    )
    .toMatchObject({ from: expect.any(Number), to: expect.any(Number) });
}

async function collectPromptEditorSearchJump(desktopWindow: Page) {
  return desktopWindow.evaluate((needle) => {
    const debugApi = globalThis.window?.__folioleDebug;
    const workspaceApi = globalThis.window?.__folioleWorkspaceDebug;
    const content = debugApi?.getEditorContent?.('prompt-editor') ?? '';
    const selection = debugApi?.getEditorSelection?.('prompt-editor') ?? null;
    const positionTop = selection ? debugApi?.getEditorPositionViewportTop?.('prompt-editor', selection.from) ?? null : null;
    const viewport = debugApi?.getEditorViewportRect?.('prompt-editor') ?? null;
    return {
      activeNodeId: workspaceApi?.getActiveNodeId?.() ?? null,
      scrollTop: debugApi?.getEditorScrollTop?.('prompt-editor') ?? null,
      selectedText: selection ? content.slice(selection.from, selection.to) : '',
      selection,
      viewportRatio:
        typeof positionTop === 'number' && viewport && viewport.height > 0
          ? (positionTop - viewport.top) / viewport.height
          : null,
      expectedIndex: content.indexOf(needle)
    };
  }, NEEDLE);
}

async function openWorkspaceSearch(desktopWindow: Page) {
  const toolbar = desktopWindow.getByRole('region', { name: /Left toolbar|左侧工具栏/ });
  const searchButton = toolbar.getByRole('button', { name: /Search|搜索/ });
  const searchDialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await searchButton.click();
  const searchEnhancementPrompt = desktopWindow.getByRole('dialog', {
    name: /(Turn on search enhancement for languages without spaces|要为无空格语言开启搜索增强|使用中文、日文或韩文搜索)/
  });
  await expect.poll(async () => {
    if (await searchEnhancementPrompt.isVisible()) return 'prompt';
    if (await searchDialog.isVisible()) return 'search';
    return 'pending';
  }).not.toBe('pending');
  if (await searchEnhancementPrompt.isVisible().catch(() => false)) {
    await searchEnhancementPrompt.getByRole('button', { name: /(Not now|暂不)/ }).click();
    await expect(searchEnhancementPrompt).toBeHidden();
    if (!await searchDialog.isVisible().catch(() => false)) await searchButton.click();
  }
}

test('clicking a workspace search body hit jumps to the matched text', async ({ desktopWindow }, testInfo) => {
  await expect(desktopWindow.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  await seedSearchJumpWorkspace(desktopWindow);
  await waitForWorkspaceSearchHit(desktopWindow);

  await openWorkspaceSearch(desktopWindow);
  const dialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill(NEEDLE);

  const targetResult = dialog.getByRole('button', { name: new RegExp(TARGET_TITLE) });
  await expect(targetResult).toBeVisible();
  await targetResult.click();

  await expect
    .poll(() => collectPromptEditorSearchJump(desktopWindow), {
      message: 'waiting for search result click to reveal the body match in the editor'
    })
    .toMatchObject({
      activeNodeId: TARGET_NODE_ID,
      selectedText: NEEDLE,
      selection: { from: expect.any(Number), to: expect.any(Number) },
      scrollTop: expect.any(Number)
    });

  const finalState = await collectPromptEditorSearchJump(desktopWindow);
  expect(finalState.selection).toEqual({
    from: finalState.expectedIndex,
    to: finalState.expectedIndex + NEEDLE.length
  });
  expect(finalState.scrollTop).toBeGreaterThan(0);
  expect(finalState.viewportRatio).toBeGreaterThan(0.2);
  expect(finalState.viewportRatio).toBeLessThan(0.8);

  await testInfo.attach('workspace-search-body-jump', {
    body: JSON.stringify(finalState, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('workspace-search-body-jump-visible-result', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });
});
