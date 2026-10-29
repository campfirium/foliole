// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { softDeleteNodes } from '../../lib/core/database/nodeMutations';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { act, open, publish } from '../test/dailyFlowExceptions.testSupport';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { persistFlowMutation } from './companionFlowMutation';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
const now = '2026-10-26T08:00:00.000Z';
let library: Awaited<ReturnType<typeof createSearchLibrary>> | undefined;
afterEach(async () => { await library?.close(); await closeLibraries(); library = undefined; });

it('undoes and redoes mobile progress after a real peer grades the same item and both libraries synchronize', async () => {
  library = await createSearchLibrary(0);
  const peers = await connectCompanionPeer(library);
  await seedCompanionReviewHistory({ due: now, lastReviewAt: null, state: 0, stability: 0, difficulty: 0,
    elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }, now);
  let session = (await openCompanionDailyFlow({ now, mode: 'review-first' })).session;
  await peers.exchange();
  const remote = await open(peers.desktop, now);
  const id = session.currentNodeId!;
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  session.isAnswerRevealed = true;
  const result = await persistFlowMutation({ action: 'grade', grade: 3, nodeId: id, now: '2026-10-26T08:01:00.000Z',
    snapshot, history: { key: 'flow_history:sync', mode: 'review-first', session } });
  session = result.session!;
  await act(peers.desktop, remote, 'grade', '2026-10-26T08:02:00.000Z');
  await peers.exchange();
  session = (await openCompanionDailyFlow({ now: '2026-10-26T08:03:00.000Z', mode: 'review-first' })).session;
  const before = peers.mobile.db.prepare('SELECT * FROM review_log WHERE kind=\'review\' ORDER BY op_id').all();
  session = (await replayCompanionFlowHistory('flow_history:sync', 'undo', session))!;
  expect((await loadCompanionFlowHistory('flow_history:sync')).redoStack).toHaveLength(1);
  expect(peers.mobile.db.prepare('SELECT reps FROM node_review WHERE node_id=?').get(id)).toEqual({ reps: 3 });
  await peers.exchange();
  for (const peer of [peers.mobile, peers.desktop]) {
    expect(peer.db.prepare('SELECT * FROM review_log WHERE kind=\'review\' ORDER BY op_id').all()).toEqual(before);
    expect(peer.db.prepare('SELECT reps FROM node_review WHERE node_id=?').get(id)).toEqual({ reps: 3 });
  }
  session = (await replayCompanionFlowHistory('flow_history:sync', 'redo', session))!;
  await peers.exchange();
  for (const peer of [peers.mobile, peers.desktop]) {
    expect(peer.db.prepare('SELECT reps FROM node_review WHERE node_id=?').get(id)).toEqual({ reps: 4 });
    const reader = new Database(peer.file, { readonly: true });
    try { expect(reader.prepare('SELECT reps FROM node_review WHERE node_id=?').get(id)).toEqual({ reps: 4 }); }
    finally { reader.close(); }
  }
  expect(await readCycleRows(peers.mobile.port)).toEqual(await readCycleRows(peers.desktop.port));
  expect((await readDailyFlow(peers.mobile.port))!.session.reviewedItemCount).toBe(1);
  expect((await readDailyFlow(peers.desktop.port))!.session.reviewedItemCount).toBe(1);
  expect((await readDailyFlow(peers.mobile.port))!.session.currentNodeId)
    .toBe((await readDailyFlow(peers.desktop.port))!.session.currentNodeId);
});


it('rejects wrong-library and deleted-node mobile undo without moving history or writing void events', async () => {
  library = await createSearchLibrary(0);
  const peers = await connectCompanionPeer(library);
  await seedCompanionReviewHistory({ due: now, lastReviewAt: null, state: 0, stability: 0, difficulty: 0,
    elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }, now);
  let session = (await openCompanionDailyFlow({ now, mode: 'review-first' })).session;
  await peers.exchange();
  const id = session.currentNodeId!;
  const result = await persistFlowMutation({ action: 'grade', grade: 3, nodeId: id, now,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot!,
    history: { key: 'flow_history:guard', mode: 'review-first', session } });
  session = result.session!;
  const history = await loadCompanionFlowHistory('flow_history:guard');
  await expect(replayCompanionFlowHistory('flow_history:guard', 'undo', {
    ...session, daily: { ...session.daily!, scope: 'another-library' }
  })).rejects.toThrow('daily_flow_library_changed');
  expect(await loadCompanionFlowHistory('flow_history:guard')).toEqual(history);
  softDeleteNodes(peers.desktop.driver, { nodeIds: [id], deletedAt: '2026-10-26T08:02:00.000Z' });
  publish(peers.desktop, id, '2026-10-26T08:02:00.000Z');
  await peers.exchange();
  expect(peers.mobile.db.prepare('SELECT deleted_at FROM nodes WHERE id=?').get(id))
    .toEqual({ deleted_at: '2026-10-26T08:02:00.000Z' });
  await expect(replayCompanionFlowHistory('flow_history:guard', 'undo', session)).rejects.toThrow('daily_flow_learning_changed');
  expect(await loadCompanionFlowHistory('flow_history:guard')).toEqual(history);
  expect(peers.mobile.db.prepare("SELECT * FROM review_log WHERE kind='void'").all()).toEqual([]);
});
