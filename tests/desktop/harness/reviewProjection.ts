import type { Page } from '@playwright/test';

import { pressWorkspaceHistory } from './contextualWorkspaceHistory';
import { expect } from './fixtures';
import { expectHistoryCommand, HISTORY_NODE_IDS } from './workspaceHistory';

async function gradeState(page: Page) {
  return page.evaluate(async id => {
    const api = window.__folioleWorkspaceDebug;
    const snapshot = await window.electronAPI?.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    return { ui: api?.getNode?.(id)?.review ?? null, persisted: snapshot?.nodesById[id]?.review ?? null,
      nextDue: api?.getReviewSession?.().nextReviewDueAt ?? null };
  }, HISTORY_NODE_IDS.review);
}

/** Undo voids a fact; redo scores again at the redo time rather than restoring old timestamps. */
export async function roundTripReviewGrade(page: Page, grade: () => Promise<void>) {
  await grade();
  await expectHistoryCommand(page, 'Undo Grade Review');
  await expect.poll(async () => (await gradeState(page)).ui?.reps).toBe(1);
  const scored = await gradeState(page);
  expect(scored.ui).toEqual(scored.persisted);
  expect(scored.nextDue).toBe(scored.persisted?.due);
  await pressWorkspaceHistory(page, 'undo');
  await expectHistoryCommand(page, 'Redo Grade Review');
  await expect.poll(async () => (await gradeState(page)).ui).toBeNull();
  expect((await gradeState(page)).persisted).toBeNull();
  await pressWorkspaceHistory(page, 'redo');
  await expectHistoryCommand(page, 'Undo Grade Review');
  await expect.poll(async () => (await gradeState(page)).ui?.reps).toBe(1);
  const redone = await gradeState(page);
  expect(redone.ui).toEqual(redone.persisted);
  expect(redone.nextDue).toBe(redone.persisted?.due);
  expect(Date.parse(redone.persisted!.lastReviewAt!)).toBeGreaterThanOrEqual(Date.parse(scored.persisted!.lastReviewAt!));
}
