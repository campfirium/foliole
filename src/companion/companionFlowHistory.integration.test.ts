// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { commitCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { saveCompanionSyncNodeReviewRecord } from '../shared/platform/companionSyncObjects';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { advanceFlowSession, resumeFlowSession } from '../store/workspaceFlowSession';
import { createStartedReviewSession } from '../store/workspaceReviewReading';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { persistFlowMutation } from './companionFlowMutation';


vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-25T08:00:00.000Z';
const key = 'flow_history:test';
const profile = { due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
  state: 2 as const, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 };
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let session: ReviewSessionState;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  const records = await Promise.all(['a', 'b', 'c'].map(id => toWorkspaceNativeNodeVersion({
    id, title: id, content: id, kind: 'item', parentNodeId: null, reveal: `Answer ${id}`, anchorLink: null,
    isTitleManual: true, hideTitleHeading: false, reading: null, review: profile,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: now }, 'remote', `base-${id}`)));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }));
  for (const nodeId of ['a', 'b', 'c']) await saveCompanionSyncNodeReviewRecord({ nodeId, review: profile });
  session = resumeFlowSession(await snapshot(), 'review-first', 'a', now);
});
afterEach(async () => { await library.close(); });

async function grade(value: 1 | 2 | 3 | 4 = 3) {
  session = { ...session, isAnswerRevealed: true };
  const result = await persistFlowMutation({ action: 'grade', grade: value, nodeId: session.currentNodeId!,
    snapshot: await snapshot(), now, history: { key, mode: 'review-first', session } });
  session = advanceFlowSession({ action: 'grade', snapshot: result.snapshot, session, mode: 'review-first', now });
}
async function replay(mode: 'undo' | 'redo') {
  session = (await replayCompanionFlowHistory(key, mode, session)) ?? session;
}
const count = () => library.database.prepare('SELECT COUNT(*) AS count FROM review_log').get();

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
  expect((await snapshot()).nodesById.a?.review).toEqual(graded.nodesById.a?.review);
  expect((await snapshot()).nodesById.b?.review).toEqual(graded.nodesById.b?.review);
  const reader = new Database(path.join(library.root, 'library.db'), { readonly: true });
  try { expect(reader.prepare("SELECT reps FROM node_review WHERE node_id='b'").get()).toEqual({ reps: 3 }); }
  finally { reader.close(); }
  expect(count()).toEqual({ count: 2 });
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
  expect(count()).toEqual({ count: 3 });
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

it('refuses to overwrite a newer review and retains the history cursor', async () => {
  await grade();
  const newer = { ...profile, reps: 10, lastReviewAt: '2026-10-26T00:00:00.000Z' };
  await saveCompanionSyncNodeReviewRecord({ nodeId: 'a', review: newer });
  const history = await loadCompanionFlowHistory(key);
  await expect(replay('undo')).rejects.toThrow('flow_history_changed');
  expect((await snapshot()).nodesById.a?.review).toEqual(newer);
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
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
  session = resumeFlowSession(await snapshot(), 'review-first', 'a', now);
  await grade();
  expect((await snapshot()).nodesById.a?.review?.reps).toBe(1);
  await replay('undo');
  expect((await snapshot()).nodesById.a?.review).toBeNull();
  const tombstone = library.database.prepare<[], { content_hash: string; deleted_at: string }>("SELECT content_hash, deleted_at FROM sync_object_state WHERE object_type='node_review' AND object_id='a'")
    .get()!;
  expect(tombstone.content_hash).toBe(computeSyncContentHash('node_review', {
    deleted_at: tombstone.deleted_at, node_id: 'a', object_type: 'node_review'
  }));
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
  library.database.prepare("UPDATE nodes SET kind='topic', reveal=NULL WHERE id='a'").run();
  const before = await snapshot();
  session = createStartedReviewSession({ currentNodeId: 'a', continueNodeId: null,
    queueNodeIds: ['a', 'b', 'c'], sessionStartedAt: now, totalNodeCount: 3 });
  let after = before;
  const history = { key, mode: 'recommended' as const, session };
  if (action === 'soon') {
    await commitCompanionFlowHistory({ key, entry: createCompanionFlowHistoryEntry({ action,
      nodeId: 'a', now, before, after, history }) });
  } else {
    after = (await persistFlowMutation({ action, nodeId: 'a', now, snapshot: before, history })).snapshot;
  }
  session = advanceFlowSession({ action, snapshot: after, session, mode: 'recommended', now });
  await replay('undo');
  expect(session.currentNodeId).toBe('a');
  expect((await snapshot()).nodesById.a?.reading).toEqual(before.nodesById.a?.reading);
  await replay('redo');
  expect((await snapshot()).nodesById.a?.reading).toEqual(after.nodesById.a?.reading);
  expect(count()).toEqual({ count: 0 });
});
