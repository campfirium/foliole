// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'grade-concurrency', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: tempRoot, app_cache_dir: path.join(tempRoot, 'cache'),
    app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs') })
}));

import { closeDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import * as reviewCalculation from '../../lib/core/review/recomputeReview.js';
import { normalizeScheduledCardDue } from '../../lib/core/review/reviewDayBoundary.js';
import { mapGradeToRustRating } from '../../lib/core/review/types.js';
import { connection, externalGrade, facts, history, now, prepare, reopen, saveNode, snapshot } from '../../tests/fixtures/workspaceReviewGradeConcurrency';
import { toNodeReviewProfile, toSchedulerCard } from '../features/review/model/reviewTypes';
import { getCurrentReviewSchedulerSettings, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { resetWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import * as queue from './workspaceReviewLiveQueue';
import { createQaNode } from './workspaceStoreReviewActions.test-support';

const originalSettings = getCurrentReviewSchedulerSettings();

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-grade-concurrency-'));
  initializeDatabase();
});
afterEach(async () => {
  vi.restoreAllMocks();
  hydrateCurrentReviewSchedulerSettings(originalSettings);
  resetWorkspaceHistoryPersistence();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it.each(['compute', 'receipt'] as const)('retains concurrent edits and additions during grade %s', async phase => {
  const harness = prepare();
  const before = harness.getState();
  const currentId = before.reviewSession.currentNodeId!;
  const otherId = currentId === 'first' ? 'other' : 'first';
  const pending = harness.actions.gradeReviewCard(3, now);
  await harness.computing;
  if (phase === 'receipt') {
    harness.releaseCompute();
    await harness.saving;
  }
  const other = { ...before.nodesById[otherId]!, title: 'Updated unrelated title', content: 'Updated unrelated body' };
  const current = { ...before.nodesById[currentId]!, title: 'Updated question title', content: 'Updated question' };
  const added = createQaNode('added', '2026-11-10T08:00:00.000Z');
  saveNode(other);
  saveNode(current);
  saveNode(added);
  harness.setState({ nodesById: { ...before.nodesById, [currentId]: current, [otherId]: other, added },
    nodeOrder: [...before.nodeOrder, added.id] });
  harness.releaseCompute();
  harness.releaseSave();
  await expect(pending).resolves.toBe(true);
  const after = harness.getState();
  expect(after.nodesById[otherId]).toEqual(other);
  expect(after.nodesById.added).toEqual(added);
  expect(after.nodesById[currentId]).toMatchObject({ title: current.title, content: current.content });
  expect(after.nodesById[currentId]!.review).toEqual(snapshot().nodesById[currentId]!.review);
  expect(after.appActionHistory.undoStack).toHaveLength(1);
  expect(facts()).toHaveLength(1);
  const disk = reopen();
  for (const id of [currentId, otherId, added.id]) {
    expect(disk.nodesById[id]).toMatchObject({ title: after.nodesById[id]!.title,
      content: after.nodesById[id]!.content, review: after.nodesById[id]!.review });
  }
});

it.each(['compute', 'receipt'] as const)('rejects a newer target review during grade %s', async phase => {
  const harness = prepare();
  const before = harness.getState();
  const currentId = before.reviewSession.currentNodeId!;
  const pending = harness.actions.gradeReviewCard(3, now);
  await harness.computing;
  if (phase === 'receipt') {
    harness.releaseCompute();
    await harness.saving;
  }
  const newer = { ...before.nodesById[currentId]!, review: externalGrade(currentId) };
  harness.setState({ nodesById: { ...before.nodesById, [currentId]: newer } });
  harness.releaseCompute();
  harness.releaseSave();
  await expect(pending).resolves.toBe(false);
  expect(harness.getState().nodesById[currentId]).toEqual(newer);
  expect(harness.getState().reviewSession).toEqual(before.reviewSession);
  expect(harness.getState().appActionHistory.undoStack).toHaveLength(0);
  expect(facts()).toHaveLength(phase === 'compute' ? 1 : 2);
  expect(reopen().nodesById[currentId]!.review).toEqual(newer.review);
});

it('does not advance on a SQLite failure and commits a successful retry only once', async () => {
  const harness = prepare();
  const before = harness.getState();
  const currentId = before.reviewSession.currentNodeId!;
  connection().sqlite.exec(`CREATE TEMP TRIGGER reject_grade BEFORE INSERT ON review_log
    BEGIN SELECT RAISE(ABORT, 'grade_save_failure'); END`);
  harness.releaseCompute();
  harness.releaseSave();
  await expect(harness.actions.gradeReviewCard(3, now)).resolves.toBe(false);
  expect(harness.getState().nodesById).toEqual(before.nodesById);
  expect(harness.getState().reviewSession).toEqual(before.reviewSession);
  expect(harness.getState().appActionHistory.undoStack).toHaveLength(0);
  expect(facts()).toEqual([]);
  expect(snapshot().nodesById[currentId]!.review).toEqual(before.nodesById[currentId]!.review);
  connection().sqlite.exec('DROP TRIGGER reject_grade');
  await expect(harness.actions.gradeReviewCard(3, now)).resolves.toBe(true);
  expect(facts()).toHaveLength(1);
  expect(reopen().nodesById[currentId]!.review!.reps).toBe(1);
});

it('preserves concurrent content through grade undo, redo and reopen', async () => {
  const harness = prepare();
  const historyActions = history(harness);
  const before = harness.getState();
  const currentId = before.reviewSession.currentNodeId!;
  const pending = harness.actions.gradeReviewCard(3, now);
  harness.releaseCompute();
  await harness.saving;
  const current = { ...before.nodesById[currentId]!, title: 'Concurrent title' };
  saveNode(current);
  harness.setState({ nodesById: { ...before.nodesById, [currentId]: current } });
  harness.releaseSave();
  await expect(pending).resolves.toBe(true);
  expect(historyActions.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(reopen().nodesById[currentId]).toMatchObject({ title: current.title, review: current.review! });
  expect(historyActions.redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack).toHaveLength(1));
  expect(harness.getState().nodesById[currentId]!.title).toBe(current.title);
  expect(reopen().nodesById[currentId]!.review).toEqual(harness.getState().nodesById[currentId]!.review);
  expect(facts().map(fact => fact.kind)).toEqual(['review', 'void', 'review']);
});

it('commits and replays a grade before a future reset while retaining the authoritative null projection', async () => {
  const harness = prepare();
  const historyActions = history(harness);
  const currentId = harness.getState().reviewSession.currentNodeId!;
  const plan = vi.spyOn(queue, 'buildCurrentReviewSessionQueueOutput');
  connection().sqlite.prepare(`INSERT INTO review_log
    (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind)
    VALUES ('future-reset', 'future-reset', 'offline', ?, 0, '', '2099-10-25T08:00:00.000Z', 'reset')`).run(currentId);
  harness.releaseCompute();
  harness.releaseSave();
  await expect(harness.actions.gradeReviewCard(3, now)).resolves.toBe(true);
  expect(harness.getState().nodesById[currentId]!.review).toBeNull();
  expect(plan).toHaveBeenCalledTimes(1);
  expect(harness.getState().appActionHistory.undoStack.at(-1)).toMatchObject({ afterReview: null });
  expect(reopen().nodesById[currentId]!.review).toBeNull();
  expect(historyActions.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(historyActions.redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack).toHaveLength(1));
  expect(harness.getState().nodesById[currentId]!.review).toBeNull();
  expect(reopen().nodesById[currentId]!.review).toBeNull();
});

const gradeCases = ([1, 2, 3, 4] as const).flatMap(grade =>
  [true, false].map(sameReceipt => ({ grade, sameReceipt })));
it.each(gradeCases)('calculates only grade $grade and plans once with equal receipt=$sameReceipt', async ({ grade, sameReceipt }) => {
  const hour = new Date(now).getHours();
  hydrateCurrentReviewSchedulerSettings({ ...originalSettings,
    newDayStartsAtHour: sameReceipt ? hour : (hour + 1) % 24 });
  const harness = prepare();
  const before = harness.getState();
  const nodeId = before.reviewSession.currentNodeId!;
  const preview = await harness.scheduler.preview({ nodeId,
    card: toSchedulerCard(before.nodesById[nodeId]!.review ?? null, now), now });
  const calculate = vi.spyOn(reviewCalculation, 'previewReviewAt');
  const plan = vi.spyOn(queue, 'buildCurrentReviewSessionQueueOutput');
  const pending = harness.actions.gradeReviewCard(grade, now);
  harness.releaseCompute();
  await harness.saving;
  expect(calculate).toHaveBeenCalledTimes(1);
  expect(plan).not.toHaveBeenCalled();
  harness.releaseSave();
  await expect(pending).resolves.toBe(true);
  expect(plan).toHaveBeenCalledTimes(1);
  expect(harness.persistReviewGrade.mock.calls[0]![0].cardAfter).toEqual(normalizeScheduledCardDue({
    card: preview[mapGradeToRustRating(grade)].card, reviewedAt: now,
    newDayStartsAtHour: getCurrentReviewSchedulerSettings().newDayStartsAtHour
  }));
  const predicted = toNodeReviewProfile(harness.persistReviewGrade.mock.calls[0]![0].cardAfter);
  const persisted = snapshot().nodesById[nodeId]!.review;
  if (sameReceipt) expect(predicted).toEqual(persisted);
  else expect(predicted).not.toEqual(persisted);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  if (entry.type !== 'review.grade') throw new Error('expected grade history');
  expect(entry).toMatchObject({ afterReview: snapshot().nodesById[entry.nodeId]!.review });
  expect(facts().filter(row => row.kind === 'review')).toMatchObject([{ grade }]);
  expect(reopen().nodesById[entry.nodeId]!.review).toEqual(entry.afterReview);
});

it('does not plan a queue for a failed save and settles an undo requested while saving', async () => {
  const harness = prepare();
  const historyActions = history(harness);
  const plan = vi.spyOn(queue, 'buildCurrentReviewSessionQueueOutput');
  connection().sqlite.exec(`CREATE TEMP TRIGGER reject_grade BEFORE INSERT ON review_log
    BEGIN SELECT RAISE(ABORT, 'grade_save_failure'); END`);
  harness.releaseCompute();
  harness.releaseSave();
  await expect(harness.actions.gradeReviewCard(3, now)).resolves.toBe(false);
  expect(plan).not.toHaveBeenCalled();
  connection().sqlite.exec('DROP TRIGGER reject_grade');
  const retry = harness.actions.gradeReviewCard(3, now);
  await harness.saving;
  expect(historyActions.undoWorkspaceAction()).toBe(true);
  await expect(retry).resolves.toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(facts().map(row => row.kind)).toEqual(['review', 'void']);
  expect(reopen().nodesById.first!.review!.reps).toBe(0);
});
