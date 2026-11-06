import fs from 'node:fs';
import path from 'node:path';

import { runPaletteHistoryCommand } from './harness/contextualWorkspaceHistory';
import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const id = 'fsrs7-native-card';
const persisted = (page: import('@playwright/test').Page) => page.evaluate(async nodeId => {
  const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
  return snapshot.nodesById[nodeId]?.review;
}, id);

test('previews, grades, undoes and reloads with durable FSRS7 dual memory', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async nodeId => {
    localStorage.setItem('foliole-app-language', 'en');
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes([{ id: nodeId, kind: 'item', title: 'FSRS-7 question',
      content: 'A durable question', reveal: 'A durable answer', priority: 0,
      review: { due: '2026-01-01T00:00:00.000Z', lastReviewAt: null, state: 0,
        stability: 0, stabilityFast: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
    }], { persist: true });
  }, id);
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  const preview = await page.evaluate(async nodeId => {
    const now = new Date().toISOString();
    return window.electronAPI.invoke('review_preview', { request: { nodeId, now,
      card: { due: now, last_review: null, state: 0, stability: 0, stability_fast: 0,
        difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0 } } });
  }, id);
  expect(preview.Good.card.stability).toBeCloseTo(3.9221, 7);
  expect(preview.Good.card.stability_fast).toBeCloseTo(3.13768, 7);
  expect((await persisted(page))?.reps).toBe(0);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(id);
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: /^Good$/ }).click();
  await expect.poll(async () => (await persisted(page))?.reps).toBe(1);
  const graded = await persisted(page);
  expect(graded?.stabilityFast).toBeCloseTo(3.13768, 7);
  expect(graded?.stability).toBeCloseTo(3.9221, 7);
  await runPaletteHistoryCommand(page, 'Undo Grade Review');
  await expect.poll(async () => (await persisted(page))?.reps ?? 0).toBe(0);
  await runPaletteHistoryCommand(page, 'Redo Grade Review');
  await expect.poll(async () => (await persisted(page))?.reps).toBe(1);
  const redone = await persisted(page);
  expect(redone?.stabilityFast).toBeCloseTo(3.13768, 7);
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await persisted(page)).toEqual(redone);
  const output = path.resolve('.tmp/artifacts/T731/native');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ preview, graded, redone, restored: await persisted(page) }, null, 2));
});
