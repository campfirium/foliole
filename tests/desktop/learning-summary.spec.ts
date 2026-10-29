import path from 'node:path';

import { runPaletteHistoryCommand } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('keeps complete learning in the database through native hydration, standalone dismiss and relearn', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    const now = new Date().toISOString();
    const reading = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: now, nextAt: now,
      priority: 3, readingPosition: 0, repetitionCount: 9, state: 'active' as const };
    const review = { due: now, lastReviewAt: now, state: 2 as const, stability: 7, difficulty: 4,
      elapsedDays: 2, scheduledDays: 20, reps: 9, lapses: 1 };
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'summary-topic', kind: 'topic', title: 'Summary topic', content: 'Summary body', reading },
      { id: 'summary-card', kind: 'item', title: 'Summary card', content: 'Summary prompt', reveal: 'Summary answer', review }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const loaded = await page.evaluate(async () => {
    const list = await window.electronAPI.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    const full = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return { list: ['summary-topic', 'summary-card'].map(id => list!.nodesById[id]),
      topic: full.nodesById['summary-topic']?.reading, card: full.nodesById['summary-card']?.review,
      ui: ['summary-topic', 'summary-card'].map(id => window.__folioleWorkspaceDebug!.getNode(id)) };
  });
  for (const node of loaded.list) {
    expect(node).not.toHaveProperty('reading');
    expect(node).not.toHaveProperty('review');
  }
  expect(loaded.topic?.repetitionCount).toBe(9);
  expect(loaded.card?.reps).toBe(9);
  for (const node of loaded.ui) { expect(node?.reading).toBeNull(); expect(node?.review).toBeNull(); }
  await page.getByRole('treeitem', { name: 'Summary topic', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Dismiss topic', exact: true }).click();
  const facts = () => page.evaluate(async () => (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById['summary-topic']?.reading);
  await expect.poll(async () => (await facts())?.state).toBe('dismissed');
  expect((await facts())?.repetitionCount).toBe(9);
  await runPaletteHistoryCommand(page, 'Undo Dismiss Topic');
  await expect.poll(facts).toEqual(loaded.topic);
  await page.getByRole('treeitem', { name: 'Summary topic', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Relearn', exact: true }).click();
  await page.getByRole('button', { name: 'Relearn', exact: true }).click();
  await expect.poll(facts).toBeNull();
  await page.getByRole('treeitem', { name: 'Summary card', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Relearn', exact: true }).click();
  await page.getByRole('button', { name: 'Relearn', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById['summary-card']?.review)).toBeNull();
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await facts()).toBeNull();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T632/learning-summary.png') });
});
