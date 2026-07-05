import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const PREVIEW_NODE_ID = 'playwright-search-preview-dismiss-topic';
const PREVIEW_TITLE = 'Playwright Search Preview Dismiss Topic';
const PREVIEW_QUERY = 'PreviewDismissNeedle';

async function seedPreviewWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(
    async ({ nodeId, query, title }) => {
      const api = globalThis.window?.__folioleWorkspaceDebug;
      if (!api) {
        throw new Error('missing workspace debug bridge');
      }
      await api.seedNodes([
        {
          content: `Body content for ${query}.`,
          id: nodeId,
          kind: 'topic',
          title
        }
      ], { persist: true });
      await globalThis.window?.electronAPI?.invoke('update_node_content', {
        anchorLink: null,
        content: `Body content for ${query}.`,
        createdAt: '2026-07-05T00:00:00.000Z',
        desiredRetention: null,
        hideTitleHeading: false,
        imageRegions: null,
        isTitleManual: true,
        kind: 'topic',
        nodeId,
        parentNodeId: null,
        position: 1,
        priority: null,
        reading: null,
        reveal: null,
        review: null,
        title,
        updatedAt: '2026-07-05T00:00:10.000Z',
        virtualFilter: null
      });
      await api.openNode(nodeId);
    },
    { nodeId: PREVIEW_NODE_ID, query: PREVIEW_QUERY, title: PREVIEW_TITLE }
  );
}

async function waitForPreviewSearchHit(desktopWindow: Page) {
  await expect
    .poll(
      () =>
        desktopWindow.evaluate(async ({ nodeId, query }) => {
          const results = await globalThis.window?.electronAPI?.invoke('search_workspace', { query });
          return Boolean(results?.some((result: { id?: string }) => result.id === nodeId));
        }, { nodeId: PREVIEW_NODE_ID, query: PREVIEW_QUERY }),
      { message: 'waiting for workspace search index to include the preview hit', timeout: 15_000 }
    )
    .toBe(true);
}

async function openWorkspaceSearch(desktopWindow: Page) {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  });
  await desktopWindow.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 'k' }));
  });
}

test('Escape dismisses search result preview without close chrome', async ({ desktopWindow }, testInfo) => {
  await expect(desktopWindow.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  await seedPreviewWorkspace(desktopWindow);
  await waitForPreviewSearchHit(desktopWindow);

  await openWorkspaceSearch(desktopWindow);
  const dialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill(PREVIEW_QUERY);

  const resultButton = dialog.getByRole('button', { name: new RegExp(PREVIEW_TITLE) });
  await expect(resultButton).toBeVisible();
  await resultButton.click({ modifiers: ['Shift'] });

  const preview = desktopWindow.getByRole('dialog', { name: /(Search result preview|搜索结果预览)/ });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: /(Close preview|关闭预览)/ })).toHaveCount(0);
  await testInfo.attach('search-preview-dismiss-open', {
    body: await desktopWindow.screenshot({ fullPage: false }),
    contentType: 'image/png'
  });

  await desktopWindow.keyboard.press('Escape');

  await expect(preview).toBeHidden();
});
