import process from 'node:process';

import type { Page } from '@playwright/test';

import { focusWorkspace } from './contextualContentHistory';
import { pressWorkspaceHistory } from './contextualWorkspaceHistory';
import { expect } from './fixtures';

export const HISTORY_NODE_IDS = {
  deleteFolder: 'playwright-history-delete-folder',
  deleteItem: 'playwright-history-delete-item',
  deleteTopic: 'playwright-history-delete-topic',
  lifecycle: 'playwright-history-lifecycle',
  reading: Array.from({ length: 5 }, (_, index) => `playwright-history-reading-${index + 1}`),
  review: 'playwright-history-review'
} as const;

const DUE_REVIEW = {
  difficulty: 5,
  due: '2026-04-08T00:00:00.000Z',
  elapsedDays: 0,
  lapses: 0,
  lastReviewAt: null,
  reps: 0,
  scheduledDays: 0,
  stability: 1,
  state: 0
} as const;

const FUTURE_REVIEW = {
  ...DUE_REVIEW,
  due: '2099-04-08T00:00:00.000Z',
  lastReviewAt: '2026-04-08T00:00:00.000Z',
  reps: 1,
  scheduledDays: 26_645,
  state: 2
} as const;

const FUTURE_READING = {
  intervalDurationMs: 60_000,
  intervalGrowthFactor: 2,
  lastHandledAt: '2026-04-07T00:00:00.000Z',
  nextAt: '2099-04-08T00:00:00.000Z',
  priority: 5 as const,
  readingPosition: 0,
  repetitionCount: 1,
  state: 'active' as const
};

export async function seedWorkspaceHistory(page: Page) {
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async ({ dueReview, futureReading, futureReview, ids }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { content: 'Review prompt', id: ids.review, kind: 'item', reveal: 'Review answer', review: dueReview, title: 'History Review' },
      ...ids.reading.map((id, index) => ({
        content: `Reading ${index + 1}`,
        id,
        kind: 'topic' as const,
        parentNodeId: 'special-inbox',
        reading: {
          intervalDurationMs: 60_000,
          intervalGrowthFactor: 2,
          lastHandledAt: '2026-04-07T00:00:00.000Z',
          nextAt: `2026-04-08T00:00:0${index}.000Z`,
          priority: 5 as const,
          readingPosition: 0,
          repetitionCount: 1,
          state: 'active' as const
        },
        title: `History Reading ${index + 1}`
      })),
      { content: 'Lifecycle', id: ids.lifecycle, kind: 'topic', reading: futureReading, title: 'History Lifecycle' },
      { content: '', id: ids.deleteFolder, kind: 'folder', title: 'History Delete Folder' },
      {
        content: 'Delete topic', id: ids.deleteTopic, kind: 'topic', reading: futureReading,
        shelvedAt: '2026-04-08T00:00:00.000Z', title: 'History Delete Topic'
      },
      { content: 'Delete item', id: ids.deleteItem, kind: 'item', parentNodeId: ids.deleteTopic, review: futureReview, title: 'History Delete Item' }
    ]);
  }, {
    dueReview: DUE_REVIEW,
    futureReading: FUTURE_READING,
    futureReview: FUTURE_REVIEW,
    ids: HISTORY_NODE_IDS
  });
  await expect.poll(() => page.evaluate((nodeId) =>
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.review ?? null, HISTORY_NODE_IDS.review
  )).toEqual(DUE_REVIEW);
}

export async function captureWorkspaceHistoryState(page: Page) {
  return page.evaluate(() => {
    const api = window.__folioleWorkspaceDebug;
    const nodeOrder = api?.getWorkspaceStructureState?.().nodeOrder ?? [];
    const nodes = Object.fromEntries(nodeOrder.map((nodeId) => {
      const node = api?.getNode?.(nodeId);
      return [nodeId, node ? {
        id: node.id,
        kind: node.kind,
        parentNodeId: node.parentNodeId,
        reading: node.reading,
        review: node.review,
        shelvedAt: node.shelvedAt,
        title: node.title,
        trashed: node.trashed
      } : null];
    }));
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      nodeOrder,
      nodes,
      reviewSession: api?.getReviewSession?.() ?? null
    };
  });
}

export async function capturePermanentHistoryState(page: Page, nodeIds: string[]) {
  return page.evaluate((ids) => Object.fromEntries(ids.map((nodeId) => {
    const node = window.__folioleWorkspaceDebug?.getNode?.(nodeId);
    return [nodeId, node ? {
      id: node.id,
      kind: node.kind,
      parentNodeId: node.parentNodeId,
      reading: node.reading,
      review: node.review,
      shelvedAt: node.shelvedAt,
      title: node.title,
      trashed: node.trashed
    } : null];
  })), nodeIds);
}

export async function expectHistoryCommand(page: Page, title: string) {
  await focusWorkspace(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const dialog = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill(title);
  await expect(dialog.getByRole('button', { name: title, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

export async function roundTripWorkspaceAction(
  page: Page,
  title: string,
  run: () => Promise<unknown>,
  finish: 'after' | 'before' = 'after'
) {
  const before = await captureWorkspaceHistoryState(page);
  await run();
  await expectHistoryCommand(page, `Undo ${title}`);
  const after = await captureWorkspaceHistoryState(page);
  expect(after).not.toEqual(before);
  await pressWorkspaceHistory(page, 'undo');
  await expectHistoryCommand(page, `Redo ${title}`);
  await expect.poll(() => captureWorkspaceHistoryState(page)).toEqual(before);
  await pressWorkspaceHistory(page, 'redo');
  await expectHistoryCommand(page, `Undo ${title}`);
  await expect.poll(() => captureWorkspaceHistoryState(page)).toEqual(after);
  if (finish === 'before') {
    await pressWorkspaceHistory(page, 'undo');
    await expectHistoryCommand(page, `Redo ${title}`);
    await expect.poll(() => captureWorkspaceHistoryState(page)).toEqual(before);
  }
  return { after, before };
}

export async function roundTripStructureCreate(page: Page, run: () => Promise<string>) {
  const before = await captureWorkspaceHistoryState(page);
  const nodeId = await run();
  await expectHistoryCommand(page, 'Undo Create Topic');
  const after = await captureWorkspaceHistoryState(page);
  await pressWorkspaceHistory(page, 'undo');
  await expectHistoryCommand(page, 'Redo Create Topic');
  await expect.poll(() => page.evaluate((id) =>
    window.__folioleWorkspaceDebug?.getNode?.(id)?.trashed ?? null, nodeId
  )).toBe(true);
  await expect.poll(() => captureWorkspaceHistoryState(page).then((state) => ({
    activeNodeId: state.activeNodeId,
    reviewSession: state.reviewSession
  }))).toEqual({ activeNodeId: before.activeNodeId, reviewSession: before.reviewSession });
  await pressWorkspaceHistory(page, 'redo');
  await expectHistoryCommand(page, 'Undo Create Topic');
  await expect.poll(() => captureWorkspaceHistoryState(page)).toEqual(after);
  await pressWorkspaceHistory(page, 'undo');
  await expectHistoryCommand(page, 'Redo Create Topic');
  return nodeId;
}

export async function enterWorkspaceHistoryFlow(page: Page) {
  const currentNodeId = await page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getReviewSession?.().currentNodeId ?? null);
  if (currentNodeId === HISTORY_NODE_IDS.review) return;
  const resumeReview = page.getByRole('button', { name: /^(Resume review|继续复习|繼續複習)$/ });
  if (await resumeReview.isVisible().catch(() => false)) {
    await resumeReview.click();
  } else {
    const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
    if (await exitFlow.isVisible().catch(() => false)) await exitFlow.click();
    await page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ }).click();
  }
  await expect.poll(() => page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getReviewSession?.().currentNodeId ?? null
  )).toBe(HISTORY_NODE_IDS.review);
}

export async function runSpecifiedPostpone(page: Page) {
  await focusWorkspace(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
  const dialog = page.getByRole('dialog', { name: /Postpone Topic|推迟主题|延後主題/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('7');
  await expect(dialog).toBeHidden();
}
