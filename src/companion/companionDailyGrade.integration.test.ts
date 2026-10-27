// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { companionDailyFlowPersistence, openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import { persistFlowMutation } from './companionFlowMutation';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-26T08:00:00.000Z';
const key = 'flow_history:daily-grade';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let session: ReviewSessionState;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  const records = await Promise.all(Array.from({ length: 15 }, (_, i) => toWorkspaceNativeNodeVersion({
    id: `node-${i}`, title: `Node ${i}`, content: `Content ${i}`, kind: i < 12 ? 'item' : 'topic',
    parentNodeId: null, reveal: i < 12 ? `Answer ${i}` : null, anchorLink: null,
    isTitleManual: true, hideTitleHeading: false, reading: null, review: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now }, 'remote', `base-${i}`)));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }));
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

async function grade(value: 1 | 2 | 3 | 4, stamp = now) {
  session.isAnswerRevealed = true;
  session = (await persistFlowMutation({ action: 'grade', grade: value, nodeId: session.currentNodeId!,
    now: stamp, snapshot: await snapshot(), history: { key, mode: 'recommended', session } })).session!;
}

async function reopen() {
  await closeIosCompanionDatabase();
  const database = new Database(path.join(library.root, 'library.db'));
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: 'Search', runtime_kind: 'android-capacitor' }, createFakeCapacitorDatabaseManager(database, true, () => {}));
}

it.each([1, 2, 3, 4] as const)('keeps grade %s local and restores the same mixed order and mobile undo after reopen', async value => {
  const before = structuredClone(session);
  const next = library.database.prepare('SELECT node_id FROM daily_flow_entries WHERE active=1 AND node_id<>? ORDER BY order_key LIMIT 1')
    .get(before.currentNodeId!) as { node_id: string };
  const retained = library.database.prepare('SELECT * FROM daily_flow_entries WHERE node_id<>? ORDER BY order_key').all(before.currentNodeId!);
  const reads = vi.spyOn(companionDailyFlowPersistence, 'snapshot');
  await grade(value);
  const after = structuredClone(session);
  expect(after.currentNodeId).toBe(next.node_id);
  expect(after.reviewedItemCount).toBe((before.reviewedItemCount ?? 0) + 1);
  expect(library.database.prepare('SELECT * FROM daily_flow_entries WHERE node_id<>? ORDER BY order_key').all(before.currentNodeId!)).toEqual(retained);
  expect(reads.mock.calls.every(call => call[1] !== undefined && call[1].length <= 32)).toBe(true);
  const card = (await snapshot()).nodesById[before.currentNodeId!]!.review;
  expect(card?.reps).toBe(1);
  await reopen();
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  expect(session.queueNodeIds).toEqual(after.queueNodeIds);
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(1);
  session = (await replayCompanionFlowHistory(key, 'undo', session))!;
  expect(session.queueNodeIds).toEqual(before.queueNodeIds);
  expect((await snapshot()).nodesById[before.currentNodeId!]!.review).toBeNull();
  session = (await replayCompanionFlowHistory(key, 'redo', session))!;
  expect(session.queueNodeIds).toEqual(after.queueNodeIds);
  const restored = (await snapshot()).nodesById[before.currentNodeId!]!.review;
  expect(restored?.reps).toBe(card?.reps);
  const history = (await loadCompanionFlowHistory(key)).undoStack.at(-1)!;
  expect(history.type).toBe('review.grade');
  if (history.type === 'review.grade') expect(restored).toEqual(history.afterReview);
  const reader = new Database(path.join(library.root, 'library.db'), { readonly: true });
  try {
    expect(reader.prepare(`SELECT COUNT(*) AS n FROM review_log r WHERE kind='review'
      AND NOT EXISTS (SELECT 1 FROM review_log v WHERE v.kind='void' AND v.voids_op_id=r.op_id)`).get()).toEqual({ n: 1 });
  } finally { reader.close(); }
});

it('preserves the next reading while grading five successive items', async () => {
  const initial = (library.database.prepare('SELECT node_id FROM daily_flow_entries WHERE active=1 ORDER BY order_key').all() as { node_id: string }[]).map(row => row.node_id);
  for (let step = 0; step < 5; step += 1) {
    expect(session.currentNodeId).toBe(initial[step]);
    await grade(3);
  }
  expect(session.currentNodeId).toBe(initial[5]);
  expect((await snapshot()).nodesById[session.currentNodeId!]!.kind).toBe('topic');
  expect(session.reviewedItemCount).toBe(5);
  session = (await persistFlowMutation({ action: 'read', nodeId: session.currentNodeId!, now,
    snapshot: await snapshot(), history: { key, mode: 'recommended', session } })).session!;
  expect(session.currentNodeId).toBe(initial[6]);
});

it('keeps minute grades waiting, admits them when due, and respects a runtime short-term setting change', async () => {
  const target = session.currentNodeId!;
  library.database.prepare('UPDATE nodes SET enable_short_term=1 WHERE id=?').run(target);
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  await grade(1);
  const due = (await snapshot()).nodesById[target]!.review!.due;
  expect(due).toBe('2026-10-26T08:01:00.000Z');
  expect(session.queueNodeIds).not.toContain(target);
  await grade(3, '2026-10-26T08:00:59.000Z');
  expect(session.nextReviewDueAt).toBe(due);
  expect(session.queueNodeIds).not.toContain(target);
  await grade(3, due);
  session = (await openCompanionDailyFlow({ now: due, mode: 'review-first' })).session;
  for (let step = 0; step < 15 && session.currentNodeId !== target; step++) await grade(3, due);
  expect(session.currentNodeId).toBe(target);
  library.database.prepare('UPDATE nodes SET enable_short_term=0 WHERE id=?').run(target);
  session = (await openCompanionDailyFlow({ now: due, mode: 'recommended', preferredNodeId: target, refresh: true })).session;
  expect(session.currentNodeId).toBe(target);
  await grade(1, due);
  expect((await snapshot()).nodesById[target]!.review!.scheduledDays).toBeGreaterThanOrEqual(1);
  expect(session.queueNodeIds).not.toContain(target);
  expect((await openCompanionDailyFlow({ now: due, mode: 'recommended' })).session.queueNodeIds).toEqual(session.queueNodeIds);
});
