import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { waitForStartupGuidedSample } from './harness/startupGuidedSample';

test('keeps list learning icons and dismiss menus correct through persistence and reload', async ({ desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await waitForStartupGuidedSample(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'summary-topic', kind: 'topic', title: 'Summary topic', content: 'Summary readable body',
        reading: { intervalDurationMs: 1234, intervalGrowthFactor: 2, lastHandledAt: '2026-10-27',
          nextAt: '2026-10-29', priority: 5, readingPosition: 17, repetitionCount: 2, state: 'active' } },
      { id: 'summary-item', kind: 'item', title: 'Summary item', content: 'Summary question', reveal: 'Summary answer',
        review: { difficulty: 3, due: '2026-10-29', elapsedDays: 4, lapses: 1,
          lastReviewAt: '2026-10-27', reps: 2, scheduledDays: 5, stability: 6, state: 2 } }
    ], { persist: true });
  });
  const topic = page.locator('[data-node-id="summary-topic"]').first();
  const item = page.locator('[data-node-id="summary-item"]').first();
  await expect(topic.locator('[data-node-icon-state="scheduled"]')).toBeVisible();
  await expect(item.locator('[data-node-icon-state="scheduled"]')).toBeVisible();
  await topic.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Dismiss topic', exact: true }).click();
  await expect(topic.locator('[data-node-icon-state="dismissed"]')).toBeVisible();
  const facts = await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return { reading: snapshot.nodesById['summary-topic']!.reading,
      review: snapshot.nodesById['summary-item']!.review };
  });
  expect(facts.reading?.state).toBe('dismissed');
  expect(facts.review).toMatchObject({ stability: 6, difficulty: 3, reps: 2, lastReviewAt: '2026-10-27' });
  await page.reload();
  await expectWorkspaceShell(page);
  await expect(topic.locator('[data-node-icon-state="dismissed"]')).toBeVisible();
  await expect(item.locator('[data-node-icon-state="scheduled"]')).toBeVisible();
  await topic.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Dismiss topic', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await testInfo.attach('learning-summary', { body: await page.screenshot({
    path: path.resolve('.tmp/artifacts/T559/list-learning-summary.png') }), contentType: 'image/png' });
});
