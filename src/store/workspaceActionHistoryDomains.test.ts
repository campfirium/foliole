import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning';
import { dailyFlowCommitSchema, dailyFlowOpenSchema } from '../../lib/core/flow/dailyFlowContract';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { node, now as NOW, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { parsePersistedWorkspaceState } from './workspacePersistedStateParser';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createSchedulerGradeMock, createSetStateHarness, createWorkspaceFixture, previewStub } from './workspaceStoreReviewActions.test-support';

const transport = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => transport.invoke }));

let peer: Peer;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  [peer] = await setupPeers();
  transport.invoke.mockImplementation((command: string, input: unknown) => {
    if (command === 'open_daily_flow') return openDailyFlow(peer.port, dailyFlowOpenSchema.parse(input), settings(peer), persistence);
    if (command === 'commit_daily_flow') return commitDailyFlow(peer.port, dailyFlowCommitSchema.parse(input), settings(peer), persistence);
    if (command === 'save_node_open_state') return Promise.resolve(null);
    if (command === 'load_node_learning') return readWorkspaceNodeLearning(peer.driver, (input as { nodeIds: string[] }).nodeIds);
    throw new Error(`Unexpected history fixture command: ${command}`);
  });
});
afterEach(async () => { await closeLibraries(); vi.useRealTimers(); });

async function createReviewHarness() {
  for (const id of ['reading-1', 'reading-2']) node(peer, id, 'topic');
  const snapshot = await persistence.snapshot(peer.port);
  const harness = createSetStateHarness(createWorkspaceFixture(Object.values(parsePersistedWorkspaceState(snapshot).nodesById ?? {})));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState,
    { grade: createSchedulerGradeMock(), preview: previewStub });
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState(history);
  await actions.startReviewSession(NOW);
  return { actions, harness, history };
}

it('queues Undo behind a pending reading write and never reaches an older entry', async () => {
  const { actions, harness, history } = await createReviewHarness();
  const before = harness.getState();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const invoke = transport.invoke.getMockImplementation()!;
  transport.invoke.mockImplementation(async (command, input) => {
    if (command === 'commit_daily_flow' && input.readingAction === 'read') await gate;
    return invoke(command, input);
  });
  const read = actions.readReviewTopic(NOW);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.pendingAction).not.toBeNull());
  expect(history.undoWorkspaceAction()).toBe(true);
  expect(harness.getState().appActionHistory.pendingAction?.undoRequested).toBe(true);
  release();
  await expect(read).resolves.toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(harness.getState().reviewSession).toMatchObject({ ...before.reviewSession,
    daily: { ...before.reviewSession.daily, revision: expect.any(Number) } });
  expect(harness.getState().reviewSession.daily!.revision).toBeGreaterThan(before.reviewSession.daily!.revision);
  expect((await readDailyFlow(peer.port))?.session.currentNodeId).toBe(before.reviewSession.currentNodeId);
  expect((await persistence.snapshot(peer.port)).nodesById[before.reviewSession.currentNodeId!]!.reading).toBeNull();
});

it('rejects a session-only Soon action while the workspace cursor is applying', async () => {
  const { actions, harness } = await createReviewHarness();
  const before = harness.getState().reviewSession;
  harness.setState({ appActionHistory: { ...harness.getState().appActionHistory,
    applying: { entryId: 'applying-entry', mode: 'undo' } } });
  await expect(actions.revisitReviewTopicSoon(NOW)).resolves.toBe(false);
  expect(harness.getState().reviewSession).toEqual(before);
  expect(harness.getState().appActionHistory.undoStack).toEqual([]);
});

it('keeps the workspace cursor and state when an Undo persistence write fails', async () => {
  const { actions, harness, history } = await createReviewHarness();
  await expect(actions.readReviewTopic(NOW)).resolves.toBe(true);
  const after = harness.getState();
  const stored = await persistence.snapshot(peer.port);
  const entry = after.appActionHistory.undoStack.at(-1)!;
  peer.db.exec("CREATE TRIGGER reject_undo BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'storage full'); END");
  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.applying).toBeNull());
  expect(harness.getState().appActionHistory.undoStack.at(-1)?.id).toBe(entry.id);
  expect(harness.getState().appActionHistory.redoStack).toEqual([]);
  expect(harness.getState().reviewSession).toEqual(after.reviewSession);
  expect(await persistence.snapshot(peer.port)).toEqual(stored);
});

it('clears the whole workspace history on a late receipt after external facts changed', async () => {
  const { actions, harness, history } = await createReviewHarness();
  await expect(actions.readReviewTopic(NOW)).resolves.toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  let release!: () => void;
  let admitted!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const committed = new Promise<void>(resolve => { admitted = resolve; });
  const invoke = transport.invoke.getMockImplementation()!;
  transport.invoke.mockImplementation(async (command, input) => {
    const result = await invoke(command, input);
    if (command === 'commit_daily_flow' && input.historyMode === 'undo') { admitted(); await gate; }
    return result;
  });
  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await committed;
  const nodeId = entry.type === 'topic.dismiss' ? entry.nodeId : '';
  const current = harness.getState().nodesById[nodeId]!;
  const reading = { ...current.reading!, state: 'locked' as const };
  await peer.port.transaction(tx => persistence.reading(tx, { nodeId, before: null, after: reading }, '2026-10-26T08:00:00.002Z'));
  harness.setState({ nodesById: { ...harness.getState().nodesById,
    [nodeId]: { ...current, reading } } });
  release();
  await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack).toEqual([]));
  expect(harness.getState().appActionHistory.redoStack).toEqual([]);
  expect(harness.getState().nodesById[nodeId]?.reading?.state).toBe('locked');
  expect((await persistence.snapshot(peer.port)).nodesById[nodeId]?.reading?.state).toBe('locked');
});

it('uses a strictly newer mutation timestamp for every successful Undo and Redo write', async () => {
  const { actions, harness, history } = await createReviewHarness();
  await expect(actions.readReviewTopic(NOW)).resolves.toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  const undoMutationAt = peer.db.prepare('SELECT updated_at FROM daily_flow_state').pluck().get() as string;
  expect(Date.parse(undoMutationAt)).toBeGreaterThan(Date.parse(NOW));
  expect(history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack.at(-1)?.id).toBe(entry.id));
  const redoMutationAt = peer.db.prepare('SELECT updated_at FROM daily_flow_state').pluck().get() as string;
  expect(Date.parse(redoMutationAt)).toBeGreaterThan(Date.parse(undoMutationAt));
});
