import { afterEach, expect, it, vi } from 'vitest';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import {
  installWorkspaceHistoryPersistence,
  resetWorkspaceHistoryPersistence,
  type WorkspaceHistoryPersistenceAdapter
} from './workspaceHistoryPersistence';
import {
  browserLocalWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createReadingNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

const NOW = '2026-03-03T00:00:00.000Z';

function createHistoryPersistence(
  overrides: Partial<WorkspaceHistoryPersistenceAdapter> = {}
): WorkspaceHistoryPersistenceAdapter {
  return {
    persistNodeSnapshots: async () => true,
    persistReadingSnapshots: async () => true,
    persistReviewSnapshot: async () => true,
    persistShelveSnapshots: async () => true,
    ...overrides
  };
}

function createReviewHarness(
  persistence: WorkspaceReviewPersistenceAdapter = browserLocalWorkspaceReviewPersistence
) {
  const harness = createSetStateHarness(createWorkspaceFixture([
    createReadingNode('reading-1', '2026-03-02T00:00:00.000Z'),
    createReadingNode('reading-2', NOW)
  ]));
  const actions = createWorkspaceReviewActions(
    harness.setState,
    harness.getState,
    { grade: createSchedulerGradeMock(), preview: previewStub },
    persistence
  );
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState(history);
  actions.startReviewSession(NOW);
  return { actions, harness, history };
}

afterEach(() => resetWorkspaceHistoryPersistence());

it('queues Undo behind a pending reading write and never reaches an older entry', async () => {
  let release!: (succeeded: boolean) => void;
  const persistence: WorkspaceReviewPersistenceAdapter = {
    persistReadingNodes: () => new Promise((resolve) => { release = resolve; }),
    persistReviewGrade: async () => true
  };
  const { actions, harness, history } = createReviewHarness(persistence);
  const before = harness.getState();
  const read = actions.readReviewTopic(NOW);

  expect(history.undoWorkspaceAction()).toBe(true);
  expect(harness.getState().appActionHistory.pendingAction?.undoRequested).toBe(true);
  release(true);
  await expect(read).resolves.toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(harness.getState().reviewSession).toEqual(before.reviewSession);
});

it('rejects a session-only Soon action while the workspace cursor is applying', async () => {
  const { actions, harness } = createReviewHarness();
  const before = harness.getState().reviewSession;
  harness.setState({
    appActionHistory: {
      ...harness.getState().appActionHistory,
      applying: { entryId: 'applying-entry', mode: 'undo' }
    }
  });

  await expect(actions.revisitReviewTopicSoon(NOW)).resolves.toBe(false);
  expect(harness.getState().reviewSession).toEqual(before);
  expect(harness.getState().appActionHistory.undoStack).toEqual([]);
});

it('keeps the workspace cursor and state when an Undo persistence write fails', async () => {
  const { actions, harness, history } = createReviewHarness();
  await expect(actions.readReviewTopic(NOW)).resolves.toBe(true);
  const after = harness.getState();
  const entry = after.appActionHistory.undoStack.at(-1)!;
  installWorkspaceHistoryPersistence(createHistoryPersistence({
    persistReadingSnapshots: async () => false
  }));

  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.applying).toBeNull());
  expect(harness.getState().appActionHistory.undoStack.at(-1)?.id).toBe(entry.id);
  expect(harness.getState().appActionHistory.redoStack).toEqual([]);
  expect(harness.getState().reviewSession).toEqual(after.reviewSession);
});

it('clears the whole workspace history on a late receipt after external facts changed', async () => {
  const { actions, harness, history } = createReviewHarness();
  await expect(actions.readReviewTopic(NOW)).resolves.toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  let release!: (succeeded: boolean) => void;
  installWorkspaceHistoryPersistence(createHistoryPersistence({
    persistReadingSnapshots: () => new Promise((resolve) => { release = resolve; })
  }));

  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  const nodeId = entry.type === 'topic.dismiss' ? entry.nodeId : '';
  const node = harness.getState().nodesById[nodeId]!;
  harness.setState({
    nodesById: {
      ...harness.getState().nodesById,
      [nodeId]: { ...node, reading: { ...node.reading!, state: 'locked' } }
    }
  });
  release(true);

  await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack).toEqual([]));
  expect(harness.getState().appActionHistory.redoStack).toEqual([]);
  expect(harness.getState().nodesById[nodeId]?.reading?.state).toBe('locked');
});

it('uses a strictly newer mutation timestamp for every successful Undo and Redo write', async () => {
  const { actions, harness, history } = createReviewHarness();
  await expect(actions.readReviewTopic(NOW)).resolves.toBe(true);
  const entry = harness.getState().appActionHistory.undoStack.at(-1)!;
  const persistReadingSnapshots = vi.fn(async (nodes, updatedAt: string) => {
    void nodes;
    void updatedAt;
    return true;
  });
  installWorkspaceHistoryPersistence(createHistoryPersistence({ persistReadingSnapshots }));

  expect(history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  const undoMutationAt = persistReadingSnapshots.mock.calls[0]?.[1] ?? '';
  expect(Date.parse(undoMutationAt)).toBeGreaterThan(Date.parse(NOW));

  expect(history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack.at(-1)?.id).toBe(entry.id));
  const redoMutationAt = persistReadingSnapshots.mock.calls[1]?.[1] ?? '';
  expect(Date.parse(redoMutationAt)).toBeGreaterThan(Date.parse(undoMutationAt));
});
