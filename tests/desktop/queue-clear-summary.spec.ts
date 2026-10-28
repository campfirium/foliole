import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/T587/queue-clear-summary-hidden.png');

test('Queue clear summary omits next-review timing while reading stays available', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'queue-clear-review-item', kind: 'item', title: 'Queue Clear Review Item',
        content: 'Question body', reveal: 'Answer body',
        review: { due: '2026-04-08T00:00:00.000Z', elapsedDays: 0, lapses: 0, lastReviewAt: null,
          reps: 0, scheduledDays: 0, stability: 0, difficulty: 0, state: 0 } },
      { id: 'queue-clear-reading-topic', kind: 'topic', title: 'Queue Clear Reading Topic', content: 'Reading body' }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId))
    .toBe('queue-clear-review-item');
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId))
    .toBe('queue-clear-reading-topic');
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().cycle?.clearedAt)).toBeTruthy();
  await page.getByRole('button', { name: 'Queue clear', exact: true }).click();
  const summary = page.getByRole('menu');
  await expect(summary.getByText('Reviewed', { exact: true })).toBeVisible();
  await expect(summary.getByText('Next review', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue reading', exact: true })).toHaveCount(0);
  await page.screenshot({ path: SCREENSHOT_PATH });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeEnabled();
  await expect(page.getByText('Reading body', { exact: true })).toBeVisible();
});
