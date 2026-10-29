// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning';
import type { DailyFlowCommitArgs, DailyFlowOpenArgs } from '../../lib/core/flow/dailyFlowContract';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';
import { exchange, node, now, open, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';
import { historyEntry } from '../test/dailyFlowHistorySync.testSupport';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createQaNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

let owner: Peer;
let heldReceipt: Promise<void> | null = null;
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'load_node_learning') {
    return readWorkspaceNodeLearning(owner.driver, (args as { nodeIds: string[] }).nodeIds);
  }
  if (command === 'open_daily_flow') return openDailyFlow(owner.port, args as DailyFlowOpenArgs, settings(owner), persistence);
  if (command === 'commit_daily_flow') {
    const held = heldReceipt; heldReceipt = null;
    const result = await commitDailyFlow(owner.port, args as DailyFlowCommitArgs, settings(owner), persistence);
    if (held) await held;
    return result;
  }
  if (command === 'save_node_open_state') return null;
  if (command === 'review_grade') {
    const { rating, ...input } = (args as { request: import('../../lib/core/review/types').SchedulerGradeInput & { rating: string } }).request;
    const grade = ({ Again: 1, Hard: 2, Good: 3, Easy: 4 } as const)[rating as 'Again' | 'Hard' | 'Good' | 'Easy'];
    return createLocalReviewSchedulerAdapter().grade({ ...input, grade });
  }
  throw new Error(`Unexpected command: ${command}`);
} }));

afterEach(async () => { heldReceipt = null; vi.restoreAllMocks(); await closeLibraries(); });

function createApp() {
  const harness = createSetStateHarness(createWorkspaceFixture(['a', 'b', 'c'].map(id => createQaNode(id, now))));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  return { harness, actions, history };
}

it('uses the workspace undo and redo actions after a real peer advances and synchronizes the same list', async () => {
  const [a, b] = await setupPeers(); owner = a;
  for (const id of ['a', 'b', 'c']) node(a, id, 'item');
  await exchange(a, b);
  const { harness, actions, history } = createApp();
  await actions.startReviewSession(now);
  const id = harness.getState().reviewSession.currentNodeId!;
  actions.revealReviewAnswer();
  expect(await actions.gradeReviewCard(3, '2026-10-26T08:01:00.000Z')).toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  await historyEntry(b, id, 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  const received = await snapshot(a);
  harness.setState(state => ({ nodesById: Object.fromEntries(Object.entries(state.nodesById).map(([id, current]) =>
    [id, { ...current, review: received.nodesById[id]!.review, reading: received.nodesById[id]!.reading }])) }));
  harness.setState({ reviewSession: await open(a, '2026-10-26T08:03:00.000Z') });
  history.undoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.applying).toBeNull());
  expect(harness.getState().appActionHistory.redoStack.at(-1)?.id).toBe(entry.id);
  expect(harness.getState().nodesById[id]!.review?.reps).toBe(1);
  expect(harness.getState().reviewSession.reviewedItemCount).toBe(1);
  history.redoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.applying).toBeNull());
  expect(harness.getState().appActionHistory.undoStack.at(-1)?.id).toBe(entry.id);
  expect(harness.getState().nodesById[id]!.review?.reps).toBe(2);
  await exchange(a, b);
  expect((await snapshot(b)).nodesById[id]!.review?.reps).toBe(2);
});


it('queues workspace Undo behind an actual pending grade receipt without reaching an older action', async () => {
  const [a] = await setupPeers(); owner = a;
  for (const id of ['a', 'b', 'c']) node(a, id, 'item');
  const { harness, actions, history } = createApp();
  await actions.startReviewSession(now);
  const id = harness.getState().reviewSession.currentNodeId!;
  actions.revealReviewAnswer();
  let release!: () => void;
  heldReceipt = new Promise<void>(resolve => { release = resolve; });
  const pending = actions.gradeReviewCard(3, '2026-10-26T08:01:00.000Z');
  await vi.waitFor(() => expect(harness.getState().appActionHistory.pendingAction).not.toBeNull());
  expect(history.undoWorkspaceAction()).toBe(true);
  expect(harness.getState().appActionHistory.pendingAction?.undoRequested).toBe(true);
  release();
  expect(await pending).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(harness.getState().nodesById[id]!.review).toBeNull();
  expect(a.db.prepare('SELECT * FROM review_log WHERE kind=\'void\'').all()).toHaveLength(1);
});

it('keeps the workspace history cursor and facts after a targeted Undo write fails, then retries', async () => {
  const [a] = await setupPeers(); owner = a;
  for (const id of ['a', 'b', 'c']) node(a, id, 'item');
  const { harness, actions, history } = createApp();
  await actions.startReviewSession(now);
  actions.revealReviewAnswer();
  expect(await actions.gradeReviewCard(3, '2026-10-26T08:01:00.000Z')).toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  const before = harness.getState().reviewSession;
  a.db.exec("CREATE TRIGGER fail_undo BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  history.undoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.applying).toBeNull());
  expect(harness.getState().reviewSession).toEqual(before);
  expect(harness.getState().appActionHistory.undoStack.at(-1)?.id).toBe(entry.id);
  expect(a.db.prepare('SELECT * FROM review_log WHERE kind=\'void\'').all()).toEqual([]);
  a.db.exec('DROP TRIGGER fail_undo');
  history.undoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
});
