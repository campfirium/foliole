import fs from 'node:fs';
import path from 'node:path';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const kind of ['topic', 'item'] as const) {
  test(`handles a Dive ${kind} and resumes the original global Flow card`, async ({ desktopApp, desktopWindow: page }) => {
    await expectWorkspaceShell(page);
    await seedDiveCards(page, kind);
    await resetDailyFlowGeneration(desktopApp);
    await page.reload();
    await expectWorkspaceShell(page);
    await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());

    const dives = page.getByRole('tree', { name: 'Dives', exact: true });
    await dives.getByRole('treeitem', { name: 'Dives', exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create Dive' }).click();
    const input = page.getByRole('textbox', { name: 'Rename Untitled Dive' });
    await input.fill('Focused study');
    await input.press('Enter');
    if (kind === 'topic') {
      await dives.getByRole('treeitem', { name: 'Dives', exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Create Dive' }).click();
      const empty = page.getByRole('textbox', { name: 'Rename Untitled Dive' });
      await empty.fill('Empty study');
      await empty.press('Enter');
    }
    await addSource(page, 'Dive source');

    const current = () => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
    await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
    await expect.poll(current).toBe('global-first');
    await dives.getByRole('treeitem', { name: 'Focused study' }).click();
    await expect(page.getByRole('treeitem', { name: 'Dive topic', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start Dive', exact: true }).click();

    const id = kind === 'topic' ? 'dive-topic' : 'dive-item';
    await expect.poll(current).toBe(id);
    const output = path.resolve('.tmp/artifacts/T745-0-4');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `${kind}-in-dive.png`) });
    if (kind === 'item') {
      await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
      await page.getByRole('button', { name: 'Good', exact: true }).click();
    } else {
      await addSource(page, 'Late source');
      await expect.poll(current).toBe(id);
      await page.getByRole('button', { name: 'Read', exact: true }).click();
      await expect.poll(current).toBe('late-source');
      await page.getByRole('button', { name: 'Read', exact: true }).click();
    }
    await expect.poll(current).toBeNull();
    const initial = page.getByRole('dialog', { name: 'Dive queue complete' });
    await expect(initial).toBeVisible();
    if (kind === 'topic') await finishDiveRounds(page, output);
    await page.getByRole('dialog').getByRole('button', { name: 'Return to Flow', exact: true }).click();
    await expect.poll(current).toBe('global-first');

    const learned = await page.evaluate(async ({ id, kind }) => {
      const node = (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id];
      return kind === 'topic' ? node?.reading?.repetitionCount : node?.review?.reps;
    }, { id, kind });
    expect(learned).toBe(1);
  });
}

async function addSource(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('treeitem', { name: title, exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to Dive…' }).click();
  await page.getByRole('dialog', { name: 'Add to Dive' }).getByRole('button', { name: 'Focused study' }).click();
}

async function finishDiveRounds(page: import('@playwright/test').Page, output: string) {
  const initial = page.getByRole('dialog', { name: 'Dive queue complete' });
  await initial.getByRole('button', { name: 'Continue today’s Dive tasks' }).click();
  const today = page.getByRole('dialog', { name: 'No more Dive tasks today' });
  await expect(today).toBeVisible();
  await today.getByRole('button', { name: 'Continue Dive study' }).click();
  const topics = page.getByRole('dialog', { name: 'No Dive topics to read right now' });
  await expect(topics).toBeVisible();
  await page.screenshot({ path: path.join(output, 'topics-choice.png') });
  await topics.getByLabel('Switch Dive').selectOption({ label: 'Empty study' });
  const empty = page.getByRole('dialog', { name: 'No tasks in the Dive queue' });
  await expect(empty).toBeVisible();
  await empty.getByLabel('Flow mode').selectOption('review-first');
  await expect(empty.getByLabel('Flow mode')).toHaveValue('review-first');
  await empty.getByLabel('Flow mode').selectOption('reading-only');
  await expect(empty.getByLabel('Flow mode')).toHaveValue('reading-only');
}

async function seedDiveCards(page: import('@playwright/test').Page, kind: 'topic' | 'item') {
  await page.evaluate(async kind => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const workspace = window.__folioleWorkspaceDebug!;
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await workspace.deleteNode(node.id);
    }
    const review = { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0 as const,
      stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 };
    await workspace.seedNodes([
      { id: 'global-first', kind, title: 'Global first', content: 'Global first body', priority: 0,
        ...(kind === 'item' ? { reveal: 'Global answer', review } : {}) },
      { id: 'dive-source', kind: 'folder', title: 'Dive source', content: '' },
      { id: 'dive-topic', kind: 'topic', title: 'Dive topic', parentNodeId: 'dive-source',
        content: kind === 'topic' ? 'Dive reading body' : '' },
      ...(kind === 'item' ? [{ id: 'dive-item', kind: 'item' as const, title: 'Dive item',
        parentNodeId: 'dive-topic', content: 'Dive question', reveal: 'Dive answer', review }] :
        [{ id: 'late-folder', kind: 'folder' as const, title: 'Late source', content: '' },
          { id: 'late-source', kind: 'topic' as const, title: 'Late topic', parentNodeId: 'late-folder', content: 'Added during study' }])
    ], { persist: true });
  }, kind);
}
