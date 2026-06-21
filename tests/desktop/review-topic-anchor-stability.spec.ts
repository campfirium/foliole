import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_ID = 'playwright-review-anchor-folder';
const SOURCE_ID = 'playwright-review-anchor-source';
const CHILD_ID = 'playwright-review-anchor-child';
const SCREENSHOT_PATH = path.resolve('.lab/atlas/0active/review-topic-anchor-stability.png');

async function seedReviewAnchorWorkspace(page: Page) {
  await page.evaluate(async ({ childId, folderId, sourceId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    if (!api) {
      throw new Error('missing workspace debug bridge');
    }
    await api.seedNodes([
      {
        content: '',
        id: folderId,
        kind: 'folder',
        title: 'Review Anchor Folder'
      },
      {
        content: 'Focused source topic body.',
        id: sourceId,
        kind: 'topic',
        parentNodeId: folderId,
        title: 'Review Anchor Source Topic'
      },
      {
        content: 'Review child body.',
        id: childId,
        kind: 'topic',
        parentNodeId: sourceId,
        title: 'Review Anchor Child Topic'
      }
    ], { persist: false });
    await api.openNode(sourceId);
  }, { childId: CHILD_ID, folderId: FOLDER_ID, sourceId: SOURCE_ID });
}

async function collectTopicAnchor(page: Page) {
  return page.evaluate((sourceId) => {
    const scrollContainer = document.querySelector<HTMLElement>('.workspace-region-main-topic .app-scrollbar');
    const sourceRow = document.querySelector<HTMLElement>(`[role="treeitem"][data-node-id="${sourceId}"]`);
    return {
      scrollTop: scrollContainer?.scrollTop ?? null,
      sourceTop: sourceRow?.getBoundingClientRect().top ?? null
    };
  }, SOURCE_ID);
}

test('opening Flow keeps the topic column top anchor stable', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedReviewAnchorWorkspace(desktopWindow);
  await expect(desktopWindow.getByRole('treeitem', { name: 'Review Anchor Source Topic' })).toBeVisible();

  const before = await collectTopicAnchor(desktopWindow);
  expect(before.scrollTop).toBe(0);
  expect(before.sourceTop).not.toBeNull();

  await desktopWindow.getByRole('button', { name: 'Enter Flow' }).click();
  await expect(desktopWindow.getByRole('group', { name: 'Flow toolbar' })).toBeVisible();

  const after = await collectTopicAnchor(desktopWindow);
  expect(after.scrollTop).toBe(before.scrollTop);
  expect(after.sourceTop).not.toBeNull();
  expect(Math.abs((after.sourceTop ?? 0) - (before.sourceTop ?? 0))).toBeLessThanOrEqual(1);

  fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  await testInfo.attach('review-topic-anchor-stability-screenshot', {
    body: await fs.promises.readFile(SCREENSHOT_PATH),
    contentType: 'image/png'
  });
});
