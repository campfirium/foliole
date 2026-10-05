import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('counts scheduled Topics in the calendar and excludes unstarted reading content', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    const overdue = new Date();
    overdue.setDate(overdue.getDate() - 2);
    const future = new Date();
    future.setDate(future.getDate() + 2);
    const reading = (nextAt: string) => ({
      intervalDurationMs: 86400000, intervalGrowthFactor: 1.3,
      lastHandledAt: overdue.toISOString(), nextAt,
      priority: 5, readingPosition: 0, repetitionCount: 1, state: 'active' as const
    });
    await window.__folioleWorkspaceDebug?.seedNodes([
      { id: 'calendar-unstarted', kind: 'topic', title: 'Unstarted Topic', content: 'Unread content' },
      { id: 'calendar-overdue', kind: 'topic', title: 'Overdue Topic', content: 'Scheduled content',
        reading: reading(overdue.toISOString()) },
      { id: 'calendar-future', kind: 'topic', title: 'Future Topic', content: 'Future scheduled content',
        reading: reading(future.toISOString()) }
    ], { persist: false });
  });
  await desktopWindow.getByRole('button', { name: /^(Open Review Statistics|打开复习统计)$/ }).click();
  const calendar = desktopWindow.getByRole('dialog', { name: /^(Review statistics|复习统计)$/ });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole('columnheader', { name: /Foreground time|前台时长/ }).first())
    .toHaveText(/^(Min|分钟)$/);
  await expect(calendar.locator('[aria-current="date"]')).toHaveAttribute('aria-label', /Topics: 1(?: |$)/);
  await expect(calendar.getByRole('group', { name: /Topics: 1(?: |$)/ })).toHaveCount(2);
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/T294/foreground-statistics-minutes.png') });
});
