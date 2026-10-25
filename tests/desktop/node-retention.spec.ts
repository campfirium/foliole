import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('saves retention through Review options and uses it for the next grade', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'retention-folder', kind: 'folder', title: 'Retention folder', content: '', desiredRetention: 0.8 },
      { id: 'retention-item', kind: 'item', parentNodeId: 'retention-folder', title: 'Retention question',
        content: 'Question', reveal: 'Answer', review: {
          due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0, stability: 0, difficulty: 0,
          elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0
        } }
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode('retention-folder');
  });
  const question = page.locator('[data-node-id="retention-item"]').first();
  await expect(question).toBeVisible();
  await question.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Review options…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review options', exact: true });
  const retention = dialog.getByRole('combobox', { name: 'Review desired retention' });
  await expect(retention).toHaveValue('inherit');
  await expect(retention.getByRole('option', { name: 'Inherit resolved value (80%)' })).toHaveCount(1);
  await retention.selectOption('0.99');
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T394/retention-options.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    return snapshot.nodesById['retention-item']?.desiredRetention;
  })).toBe(0.99);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: /^Good$/ }).click();
  await expect.poll(() => page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    return snapshot.nodesById['retention-item']?.review?.reps;
  })).toBe(1);
  const comparison = await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    const review = snapshot.nodesById['retention-item']!.review!;
    const now = review.lastReviewAt!;
    const card = { due: now, last_review: null, state: 0 as const, stability: 0, difficulty: 0,
      elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0 };
    const expected = await window.electronAPI.invoke('review_preview', { request: { card, now, desiredRetention: 0.99 } });
    const inherited = await window.electronAPI.invoke('review_preview', { request: { card, now, desiredRetention: 0.8 } });
    return { days: review.scheduledDays, expected: expected.Good.card.scheduled_days,
      inherited: inherited.Good.card.scheduled_days };
  });
  expect(comparison.days).toBe(comparison.expected);
  expect(comparison.days).toBeLessThan(comparison.inherited);
});
