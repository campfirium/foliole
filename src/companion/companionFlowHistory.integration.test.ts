// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { NodeReviewProfile } from '../features/nodes/model/nodeTypes';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { commitCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncNodeVersions';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeReviewRecord } from '../shared/platform/companionSyncObjects';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { persistFlowMutation } from './companionFlowMutation';
import { gradeCompanionReviewCard } from './companionReviewSession';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-25T08:00:00.000Z';
const key = 'flow_history:test';
let profile: NodeReviewProfile = { due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
  state: 2 as const, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 };
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let session: ReviewSessionState;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  await seedCompanionReviewHistory(profile, now);
  profile = (await snapshot()).nodesById.a!.review!;
  session = (await openCompanionDailyFlow({ now, mode: 'review-first', preferredNodeId: 'a' })).session;
});
afterEach(async () => { await library.close(); });

async function grade(value: 1 | 2 | 3 | 4 = 3, stamp = now) {
  session = { ...session, isAnswerRevealed: true };
  const result = await persistFlowMutation({ action: 'grade', grade: value, nodeId: session.currentNodeId!,
    snapshot: await snapshot(), now: stamp, history: { key, mode: 'review-first', session } });
  session = result.session!;
}
async function replay(mode: 'undo' | 'redo') {
  session = (await replayCompanionFlowHistory(key, mode, session)) ?? session;
}
const count = () => library.database.prepare("SELECT COUNT(*) AS count FROM review_log r WHERE r.kind='review' AND r.reviewed_at >= '2026-10-01' AND NOT EXISTS (SELECT 1 FROM review_log v WHERE v.kind='void' AND v.voids_op_id=r.op_id)").get();

it('undoes and redoes multiple grades with their cards and persisted state, without grading again', async () => {
  const initial = await snapshot();
  expect(session.currentNodeId).toBe('a');
  await grade();
  await grade(2);
  const graded = await snapshot();
  expect(session.currentNodeId).toBe('c');
  await replay('undo');
  expect(session.currentNodeId).toBe('b');
  expect((await snapshot()).nodesById.b?.review).toEqual(initial.nodesById.b?.review);
  await replay('undo');
  expect(session.currentNodeId).toBe('a');
  expect((await snapshot()).nodesById.a?.review).toEqual(initial.nodesById.a?.review);
  await replay('redo');
  await replay('redo');
  expect(session.currentNodeId).toBe('c');
  expect((await snapshot()).nodesById.a?.review).toMatchObject({ reps: graded.nodesById.a?.review?.reps });
  expect((await snapshot()).nodesById.b?.review).toMatchObject({ reps: graded.nodesById.b?.review?.reps });
  const reader = new Database(path.join(library.root, 'library.db'), { readonly: true });
  try { expect(reader.prepare("SELECT reps FROM node_review WHERE node_id='b'").get()).toEqual({ reps: 3 }); }
  finally { reader.close(); }
  expect(count()).toEqual({ count: 2 });
});

it('keeps persisted redo identities through subsequent undo/redo cycles', async () => {
  await grade();
  await replay('undo');
  await replay('redo');
  await replay('undo');
  expect(count()).toEqual({ count: 0 });
  await replay('redo');
  await replay('undo');
  expect(count()).toEqual({ count: 0 });
});

it('clears the redo branch after a replacement grade and restores from the original review state', async () => {
  await grade(4);
  await grade(3);
  await replay('undo');
  await replay('undo');
  await grade(1);
  expect((await loadCompanionFlowHistory(key)).redoStack).toHaveLength(0);
  expect(await replayCompanionFlowHistory(key, 'redo', session)).toBeNull();
  expect((await snapshot()).nodesById.a?.review?.reps).toBe(profile.reps + 1);
  expect((await snapshot()).nodesById.b?.review).toEqual(profile);
  expect(count()).toEqual({ count: 1 });
});

it('rolls back the grade and log if its history cannot be saved', async () => {
  library.database.exec("CREATE TRIGGER reject_history BEFORE INSERT ON companion_meta WHEN NEW.key='flow_history:test' BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(grade()).rejects.toThrow();
  expect((await snapshot()).nodesById.a?.review).toEqual(profile);
  expect(count()).toEqual({ count: 0 });
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(0);
});

it('does not advance history if restoring the review state fails', async () => {
  await grade();
  const history = await loadCompanionFlowHistory(key);
  const graded = (await snapshot()).nodesById.a?.review;
  library.database.exec("CREATE TRIGGER reject_restore BEFORE UPDATE ON node_review BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(replay('undo')).rejects.toThrow();
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
  expect((await snapshot()).nodesById.a?.review).toEqual(graded);
});

it('retains a later independent grade while undoing only the selected operation', async () => {
  await grade();
  const entry = (await loadCompanionFlowHistory(key)).undoStack.at(-1)!;
  const later = '2026-10-25T08:02:00.000Z';
  const graded = await gradeCompanionReviewCard({ snapshot: await snapshot(), nodeId: 'a', grade: 2, now: later });
  if (!graded) throw new Error('missing_peer_grade');
  await saveCompanionSyncNodeReviewRecord({ nodeId: 'a', review: graded.snapshot.nodesById.a!.review!,
    reviewLog: { ...graded.reviewLog, opId: 'peer-later' } });
  const independent = library.database.prepare("SELECT * FROM review_log WHERE op_id='peer-later'").get();
  await replay('undo');
  expect((await snapshot()).nodesById.a?.review?.reps).toBe(profile.reps + 1);
  expect(library.database.prepare("SELECT * FROM review_log WHERE op_id='peer-later'").get()).toEqual(independent);
  expect(library.database.prepare('SELECT voids_op_id FROM review_log WHERE kind=\'void\'').all())
    .toEqual([{ voids_op_id: entry.id }]);
  expect((await loadCompanionFlowHistory(key)).redoStack.at(-1)?.id).toBe(entry.id);
});

it('cancels queued undo when the library lifetime changes before the write starts', async () => {
  await grade();
  const original = await snapshot();
  const history = await loadCompanionFlowHistory(key);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const occupied = runCompanionSyncWriterTask(() => gate);
  const undo = replayCompanionFlowHistory(key, 'undo', session);
  const rejected = expect(undo).rejects.toThrow('flow_history_context_changed');
  invalidateCompanionReadingScope();
  release();
  await occupied;
  await rejected;
  expect((await snapshot()).nodesById.a?.review).toEqual(original.nodesById.a?.review);
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
});

it('allows undo after revealing the next answer and restores completion through redo', async () => {
  await grade(); await grade(); await grade();
  expect(session.currentNodeId).toBeNull();
  session = { ...session, isAnswerRevealed: true };
  await replay('undo');
  expect(session.currentNodeId).toBe('c');
  await replay('redo');
  expect(session.currentNodeId).toBeNull();
  expect(count()).toEqual({ count: 3 });
});

it('restores the ungraded state of a new card without losing its redo', async () => {
  library.database.prepare("DELETE FROM node_review WHERE node_id='a'").run();
  library.database.prepare("DELETE FROM review_log WHERE node_id='a'").run();
  session = (await openCompanionDailyFlow({ now, mode: 'review-first', preferredNodeId: 'a' })).session;
  await grade();
  expect((await snapshot()).nodesById.a?.review?.reps).toBe(1);
  await replay('undo');
  expect((await snapshot()).nodesById.a?.review).toBeNull();
  expect(library.database.prepare("SELECT * FROM sync_object_state WHERE object_type='node_review' AND object_id='a'")
    .get()).toBeUndefined();
  await replay('redo');
  expect((await snapshot()).nodesById.a?.review?.reps).toBe(1);
  expect(count()).toEqual({ count: 1 });
});

it('retains history and restored review state after closing and reopening the database', async () => {
  await grade();
  await replay('undo');
  const history = await loadCompanionFlowHistory(key);
  await closeIosCompanionDatabase();
  const reopened = new Database(path.join(library.root, 'library.db'));
  const manager = createFakeCapacitorDatabaseManager(reopened, true, () => {});
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: 'Search', runtime_kind: 'android-capacitor' }, manager);
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
  expect((await snapshot()).nodesById.a?.review).toEqual(profile);
  await replay('redo');
  expect((await snapshot()).nodesById.a?.review?.reps).toBe(3);
});

it.each(['read', 'later', 'dismiss', 'soon'] as const)('restores the reading state and Flow position for %s', async action => {
  const current = (await snapshot()).nodesById.a!;
  await applyCompanionSyncNodeVersions([await toWorkspaceNativeNodeVersion({ ...current,
    kind: 'topic', reveal: null, updatedAt: now }, 'remote')]);
  const before = await snapshot();
  session = (await openCompanionDailyFlow({ now, mode: 'recommended', preferredNodeId: 'a', refresh: true })).session;
  let after = before;
  const history = { key, mode: 'recommended' as const, session };
  if (action === 'soon') {
    await commitCompanionFlowHistory({ key, mode: history.mode, entry: createCompanionFlowHistoryEntry({ action,
      nodeId: 'a', now, before, after, history }) });
  } else {
    after = (await persistFlowMutation({ action, nodeId: 'a', now, snapshot: before, history })).snapshot;
  }
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  await replay('undo');
  expect(session.currentNodeId).toBe('a');
  expect((await snapshot()).nodesById.a?.reading).toEqual(before.nodesById.a?.reading);
  await replay('redo');
  expect((await snapshot()).nodesById.a?.reading).toEqual(after.nodesById.a?.reading);
  expect(count()).toEqual({ count: 0 });
});

it('replays consecutive scores for the same card using the recalculated intermediate state', async () => {
  library.database.exec("UPDATE nodes SET enable_short_term = 1 WHERE id='a'");
  await grade(1);
  await grade(3, '2026-10-25T09:00:00.000Z');
  await grade(3, '2026-10-25T09:00:00.000Z');
  expect(session.currentNodeId).toBe('a');
  await grade(3, '2026-10-25T09:00:00.000Z');
  for (let i = 0; i < 4; i++) await replay('undo');
  expect((await snapshot()).nodesById.a?.review?.reps).toBe(2);
  for (let i = 0; i < 4; i++) await replay('redo');
  expect((await snapshot()).nodesById.a?.review?.reps).toBe(4);
  expect(count()).toEqual({ count: 4 });
});

it('persists and replays a grade whose event sorts before an already recorded reset', async () => {
  library.database.exec(`INSERT INTO review_log(id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind)
    VALUES ('future-reset', 'future-reset', 'offline', 'a', 0, '', '2099-10-25T08:00:00.000Z', 'reset')`);
  await grade();
  expect((await loadCompanionFlowHistory(key)).undoStack.at(-1)).toMatchObject({ afterReview: null });
  expect((await snapshot()).nodesById.a?.review).toBeNull();
  await replay('undo');
  await replay('redo');
  expect((await snapshot()).nodesById.a?.review).toBeNull();
});
