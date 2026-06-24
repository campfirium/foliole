import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.lab/atlas/0active/queue-clear-summary-hidden.png');
const DUE_REVIEW = {
  difficulty: 0,
  due: '2026-04-08T00:00:00.000Z',
  elapsedDays: 0,
  lapses: 0,
  lastReviewAt: null,
  reps: 0,
  scheduledDays: 0,
  stability: 0,
  state: 0
} as const;

async function seedQueueClearWorkspace(desktopWindow: import('@playwright/test').Page) {
  await desktopWindow.evaluate(async (dueReview) => {
    await globalThis.window.__folioleWorkspaceDebug?.seedNodes([
      {
        content: 'Reading body',
        id: 'queue-clear-reading-topic',
        kind: 'topic',
        title: 'Queue Clear Reading Topic'
      },
      {
        content: 'Question body',
        id: 'queue-clear-review-item',
        kind: 'item',
        reveal: 'Answer body',
        review: dueReview,
        title: 'Queue Clear Review Item'
      }
    ]);
  }, DUE_REVIEW);
  await desktopWindow.waitForFunction(() =>
    globalThis.window.__folioleWorkspaceDebug?.listNodes().some((node) => node.id === 'queue-clear-reading-topic')
  );
}

test('Queue clear summary omits next-review timing before continuing reading', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedQueueClearWorkspace(desktopWindow);

  await desktopWindow.waitForFunction(() => {
    const enterFlow = Array.from(document.querySelectorAll('button')).find((button) =>
      /^(Enter Flow|进入 Flow)$/.test(button.getAttribute('aria-label') ?? '')
    );
    enterFlow?.click();
    return Boolean(enterFlow);
  });
  const debugState = await desktopWindow.evaluate(() => ({
    activeNodeId: globalThis.window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null,
    activeNode: globalThis.window.__folioleWorkspaceDebug?.getNode?.(
      globalThis.window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? ''
    ) ?? null,
    buttons: Array.from(document.querySelectorAll('button')).map((button) =>
      button.getAttribute('aria-label') || button.textContent?.trim() || ''
    ),
    reviewSession: globalThis.window.__folioleWorkspaceDebug?.getReviewSession?.() ?? null
  }));
  expect(debugState).toMatchObject({
    activeNodeId: 'queue-clear-review-item',
    activeNode: {
      kind: 'item',
      review: { due: DUE_REVIEW.due, state: DUE_REVIEW.state }
    },
    reviewSession: { currentNodeId: 'queue-clear-review-item' }
  });
  await desktopWindow.evaluate(() => {
    globalThis.window.__folioleWorkspaceDebug?.completeReviewSessionForDebug?.({
      completedAt: '2026-04-08T00:05:00.000Z',
      continueNodeId: 'queue-clear-reading-topic',
      sessionStartedAt: '2026-04-08T00:00:00.000Z'
    });
  });

  await expect(desktopWindow.getByRole('heading', { name: 'Queue clear' })).toBeVisible();
  await expect(desktopWindow.getByText(/Reviewed|已复习/)).toBeVisible();
  await expect(desktopWindow.getByText('Next review')).toHaveCount(0);
  await expect(desktopWindow.getByText('下次复习')).toHaveCount(0);
  await expect(desktopWindow.getByRole('button', { name: /^(Continue reading|继续阅读)$/ })).toBeVisible();
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
});
