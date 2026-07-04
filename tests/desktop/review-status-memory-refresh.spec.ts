import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/review-status-memory-refresh-hidden.png');
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

test('does not reopen completed Flow from stale dev status memory after refresh', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (dueReview) => {
    window.localStorage.setItem('foliole-dev-review-status-bar-persistence-enabled', 'true');
    window.localStorage.setItem('foliole-dev-review-status-bar-open', 'true');
    await window.__folioleWorkspaceDebug?.seedNodes([
      {
        content: 'Refresh body',
        id: 'review-status-memory-refresh-item',
        kind: 'item',
        reveal: 'Refresh answer',
        review: dueReview,
        title: 'Review Status Memory Refresh Item'
      }
    ]);
    window.__folioleWorkspaceDebug?.completeReviewSessionForDebug?.({
      completedAt: '2026-04-08T00:05:00.000Z',
      continueNodeId: 'review-status-memory-refresh-item',
      sessionStartedAt: '2026-04-08T00:00:00.000Z'
    });
  }, DUE_REVIEW);

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  await expect(desktopWindow.getByRole('dialog', { name: /^All clear for now\.$/ })).toHaveCount(0);
  await expect(desktopWindow.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ })).toBeVisible();
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
});
