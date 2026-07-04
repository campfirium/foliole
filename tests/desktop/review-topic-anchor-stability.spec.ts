import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FOLDER_ID = 'playwright-review-anchor-folder';
const SOURCE_ID = 'playwright-review-anchor-source';
const CHILD_ID = 'playwright-review-anchor-child';
const ROOT_FOLDER_ID = 'playwright-root-review-anchor-folder';
const ROOT_TOPIC_PREFIX = 'playwright-root-review-anchor-topic-';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/review-topic-anchor-stability.png');

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

async function enterFlow(page: Page) {
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      /^(Enter Flow|进入 Flow)$/.test(candidate.getAttribute('aria-label') ?? '')
    );
    button?.click();
  });
  await expect(page.getByRole('group', { name: 'Flow toolbar' })).toBeVisible();
}

async function seedRootTopicAnchorWorkspace(page: Page) {
  await page.evaluate(async ({ folderId, topicPrefix }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    if (!api) {
      throw new Error('missing workspace debug bridge');
    }
    const topics = Array.from({ length: 42 }, (_, index) => ({
      content: `Root topic body ${index + 1}`,
      id: `${topicPrefix}${index}`,
      kind: 'topic' as const,
      parentNodeId: folderId,
      title: `Root Topic ${String(index + 1).padStart(2, '0')}`
    }));
    await api.seedNodes([
      {
        content: '',
        id: folderId,
        kind: 'folder',
        title: 'Root Review Anchor Folder'
      },
      ...topics
    ], { persist: false });
    await api.openNode(`${topicPrefix}0`);
  }, { folderId: ROOT_FOLDER_ID, topicPrefix: ROOT_TOPIC_PREFIX });
}

async function collectRootTopicAnchor(page: Page) {
  return page.evaluate((topicPrefix) => {
    const scrollContainer = document.querySelector<HTMLElement>('.workspace-region-main-topic .app-scrollbar');
    const topicRows = Array.from(document.querySelectorAll<HTMLElement>(`[role="treeitem"][data-node-id^="${topicPrefix}"]`));
    const visibleRows = topicRows.filter((row) => {
      if (!scrollContainer) return false;
      const rowRect = row.getBoundingClientRect();
      const scrollRect = scrollContainer.getBoundingClientRect();
      return rowRect.bottom > scrollRect.top && rowRect.top < scrollRect.bottom;
    });
    return {
      firstVisibleTopicId: visibleRows[0]?.dataset.nodeId ?? null,
      scrollTop: scrollContainer?.scrollTop ?? null
    };
  }, ROOT_TOPIC_PREFIX);
}

async function resetTopicScrollTop(page: Page) {
  await page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>('.workspace-region-main-topic .app-scrollbar');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  });
}

test('opening Flow keeps the topic column top anchor stable', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedReviewAnchorWorkspace(desktopWindow);
  await expect(desktopWindow.getByRole('treeitem', { name: 'Review Anchor Source Topic' })).toBeVisible();

  const before = await collectTopicAnchor(desktopWindow);
  expect(before.scrollTop).toBe(0);
  expect(before.sourceTop).not.toBeNull();

  await enterFlow(desktopWindow);

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

test('opening Flow keeps a folder-root topic list anchored', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedRootTopicAnchorWorkspace(desktopWindow);
  await resetTopicScrollTop(desktopWindow);

  const before = await collectRootTopicAnchor(desktopWindow);
  expect(before.scrollTop).toBe(0);
  expect(before.firstVisibleTopicId).toBe(`${ROOT_TOPIC_PREFIX}41`);

  await enterFlow(desktopWindow);

  const after = await collectRootTopicAnchor(desktopWindow);
  expect(after.scrollTop).toBe(before.scrollTop);
  expect(after.firstVisibleTopicId).toBe(before.firstVisibleTopicId);
});
