import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('finishing a Dive first leaves both other folders available in library Flow', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seedDueFolders(page);
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());

  const dives = page.getByRole('tree', { name: /^Dives?$/ });
  await dives.getByRole('treeitem', { name: /^Dives?$/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Create Dive' }).click();
  const name = page.getByRole('textbox', { name: 'Rename Untitled Dive' });
  await name.fill('Study Physics');
  await name.press('Enter');

  await page.getByRole('treeitem', { name: 'Physics', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to Dive…' }).click();
  await page.getByRole('dialog', { name: 'Add to Dive' }).getByRole('button', { name: 'Study Physics' }).click();
  await dives.getByRole('treeitem', { name: 'Study Physics' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Start Dive', exact: true }).click();

  await expect.poll(() => currentCard(page)).toBe('physics-card');
  await gradeGood(page);
  const done = page.getByRole('dialog', { name: 'Dive queue complete' });
  await expect(done).toBeVisible();
  await done.getByRole('button', { name: 'Continue today’s Dive tasks' }).click();
  await expect.poll(() => currentCard(page)).toBe('physics-topic');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const today = page.getByRole('dialog', { name: 'Today’s Dive tasks complete' });
  await expect(today).toBeVisible();
  await today.getByRole('button', { name: 'Return to Flow', exact: true }).click();

  await expect.poll(() => currentCard(page)).toMatch(/^(math|history)-(card|topic)$/);
  const queue = page.getByRole('list', { name: 'Flow items' });
  await expect(queue.getByRole('button', { name: 'Math card', exact: true })).toBeVisible();
  await expect(queue.getByRole('button', { name: 'History card', exact: true })).toBeVisible();
  await expect(queue.getByRole('button', { name: 'Physics card', exact: true })).toHaveCount(0);
  expect(await repetitions(page)).toEqual({ physics: 1, math: 0, history: 0 });
});

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

async function seedDueFolders(page: Page) {
  await page.evaluate(async subjects => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const debug = window.__folioleWorkspaceDebug!;
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await debug.deleteNode(node.id);
    }
    await debug.seedNodes(subjects.flatMap(subject => {
      const id = subject.toLowerCase();
      return [
        { id: id + '-folder', kind: 'folder' as const, title: subject, content: '' },
        { id: id + '-topic', kind: 'topic' as const, parentNodeId: id + '-folder', title: subject + ' notes', content: '' },
        { id: id + '-card', kind: 'item' as const, parentNodeId: id + '-topic', title: subject + ' card',
          content: subject + ' question', reveal: subject + ' answer', review: {
            due: '2000-01-01T00:00:00.000Z', lastReviewAt: null, state: 0 as const, stability: 0,
            difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0
          } }
      ];
    }), { persist: true });
  }, subjects);
}
