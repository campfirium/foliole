import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('runs all three Dive stages before opening library Flow', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  await page.clock.install({ time: start });
  await page.clock.setFixedTime(start);
  await seedDueFolders(page, start);
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());

  const dives = page.getByRole('tree', { name: /^Dives?$/ });
  await createDive(page, 'Study Physics');
  await createDive(page, 'Study History');

  await page.getByRole('treeitem', { name: 'Physics', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to Dive…' }).click();
  await page.getByRole('dialog', { name: 'Add to Dive' }).getByRole('button', { name: 'Study Physics' }).click();
  await dives.getByRole('treeitem', { name: 'Study Physics' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Start Dive', exact: true }).click();

  await finishInitialQueue(page);
  await finishToday(page, start);
  await finishReadingRounds(page);

  await expect.poll(() => currentCard(page)).toMatch(/^(math|history)-(card|topic)$/);
  const queue = page.getByRole('list', { name: 'Flow items' });
  await expect(queue.getByRole('button', { name: 'Math card', exact: true })).toBeVisible();
  await expect(queue.getByRole('button', { name: 'History card', exact: true })).toBeVisible();
  await expect(queue.getByRole('button', { name: 'Physics card', exact: true })).toHaveCount(0);
  expect(await repetitions(page)).toEqual({ physics: 1, math: 0, history: 0 });
});

async function createDive(page: Page, title: string) {
  await page.getByRole('tree', { name: /^Dives?$/ }).getByRole('treeitem', { name: /^Dives?$/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Create Dive' }).click();
  const name = page.getByRole('textbox', { name: 'Rename Untitled Dive' });
  await name.fill(title);
  await name.press('Enter');
}

async function checkpoint(page: Page, phase: 'initial' | 'today' | 'topics', title: string) {
  await expect.poll(() => page.evaluate(() => {
    const session = window.__folioleWorkspaceDebug!.getReviewSession();
    return { phase: session.dive?.phase, current: session.currentNodeId };
  })).toEqual({ phase, current: null });
  if (title) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dive Clear for Now', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const toolbar = page.getByRole('group', { name: 'Flow toolbar' });
  const next = toolbar.getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeEnabled();
  await expect(toolbar.getByRole('button', { name: 'Global', exact: true })).toBeEnabled();
  await expect(toolbar.getByRole('button', { name: 'Exit', exact: true })).toBeEnabled();
  return { toolbar, next };
}

async function finishInitialQueue(page: Page) {
  await expect.poll(() => currentCard(page)).toBe('physics-card');
  await gradeGood(page);
  const initial = await checkpoint(page, 'initial', 'Dive Queue Clear');
  await expect(page.getByText('Reviewed', { exact: true })).toBeVisible();
  const global = initial.toolbar.getByRole('button', { name: 'Global', exact: true });
  await global.hover();
  await expect(page.getByRole('tooltip')).toContainText('Continue learning across the whole library.');
  const switchDive = initial.toolbar.getByRole('button', { name: 'Switch', exact: true });
  await switchDive.hover();
  await expect(page.getByRole('tooltip')).toContainText('Choose another Dive to study.');
  await switchDive.click();
  await expect(page.getByRole('menuitem', { name: 'Study History' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
}

async function finishToday(page: Page, start: Date) {
  await readTopic(page, 'physics-topic');
  const waiting = await checkpoint(page, 'today', '');
  const retry = waiting.toolbar.getByRole('button', { name: 'Recheck' });
  await expect(retry).toBeEnabled();
  await page.clock.setFixedTime(hoursAfter(start, 1));
  await retry.click();
  await expect.poll(() => currentCard(page)).toBe('physics-later-card');
  await gradeGood(page);
  const today = await checkpoint(page, 'today', '');
  await today.next.click();
}

async function finishReadingRounds(page: Page) {
  await readTopic(page, 'physics-reading-1');
  await readTopic(page, 'physics-reading-2');
  const complete = await checkpoint(page, 'topics', 'Dive Reading Complete');
  await complete.next.click();
  const empty = await checkpoint(page, 'topics', 'Dive Reading Complete');
  await empty.toolbar.getByRole('button', { name: 'Global', exact: true }).click();
}

async function readTopic(page: Page, id: string) {
  await expect.poll(() => currentCard(page)).toBe(id);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
}

function hoursAfter(start: Date, hours: number) {
  return new Date(start.getTime() + hours * 3_600_000);
}

const subjects = ['Physics', 'Math', 'History'] as const;

function currentCard(page: Page) {
  return page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
}

async function gradeGood(page: Page) {
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
}

function repetitions(page: Page) {
  return page.evaluate(async subjects => {
    const { nodesById } = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return Object.fromEntries(subjects.map(subject => {
      const id = subject.toLowerCase();
      return [id, nodesById[id + '-card']?.review?.reps];
    }));
  }, subjects);
}

async function seedDueFolders(page: Page, start: Date) {
  await page.evaluate(async ({ subjects, initial, later, readings, scheduledAt }) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const debug = window.__folioleWorkspaceDebug!;
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await debug.deleteNode(node.id);
    }
    const base = subjects.flatMap(subject => {
      const id = subject.toLowerCase();
      return [
        { id: id + '-folder', kind: 'folder' as const, title: subject, content: '' },
        { id: id + '-topic', kind: 'topic' as const, parentNodeId: id + '-folder', title: subject + ' notes', content: '' },
        { id: id + '-card', kind: 'item' as const, parentNodeId: id + '-topic', title: subject + ' card',
          content: subject + ' question', reveal: subject + ' answer', review: {
            due: initial, lastReviewAt: null, state: 0 as const, stability: 0,
            difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0
          } }
      ];
    });
    await debug.seedNodes([...base, {
      id: 'physics-later-card', kind: 'item', parentNodeId: 'physics-topic', title: 'Physics later card',
      content: 'Later question', reveal: 'Later answer', review: { due: later, lastReviewAt: initial, state: 1,
        stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 0, reps: 1, lapses: 0 }
    }, ...readings.map((nextAt, index) => ({
      id: 'physics-reading-' + (index + 1), kind: 'topic' as const, parentNodeId: 'physics-folder',
      title: 'Physics reading ' + (index + 1), content: 'Scheduled reading', reading: {
        intervalDurationMs: 86400000, intervalGrowthFactor: 1.3, lastHandledAt: scheduledAt, nextAt,
        priority: 5, readingPosition: 0, repetitionCount: 0, state: 'active' as const
      }
    }))], { persist: true });
  }, { subjects, initial: hoursAfter(start, -24).toISOString(), later: hoursAfter(start, 1).toISOString(),
    scheduledAt: start.toISOString(), readings: [2, 3].map(hours => hoursAfter(start, hours).toISOString()) });
}
