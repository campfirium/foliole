import { afterEach, expect, it } from 'vitest';

import { createDismissEntireTopicAction } from '../features/nodes/components/nodeListMenuActions';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { installWorkspaceHistoryPersistence, resetWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';
import { createDismissNodesAction } from './workspaceStoreNodeDismissAction';

const now = '2026-10-28T12:00:00.000Z';
afterEach(resetWorkspaceHistoryPersistence);

function fixture() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const root = harness.getState().nodesById['node-1']!;
  harness.setState({ nodesById: { 'node-1': root,
    child: { ...root, id: 'child', parentNodeId: root.id },
    card: { ...root, id: 'card', kind: 'item', parentNodeId: root.id },
    below: { ...root, id: 'below', parentNodeId: 'card' },
    other: { ...root, id: 'other' } } });
  return { ...harness, dismiss: createDismissNodesAction(harness.setState, harness.getState),
    history: createWorkspaceActionHistoryActions(harness.setState, harness.getState) };
}

it('expands the root at click time and records one undoable reading operation through item descendants', async () => {
  const app = fixture();
  let closed = false;
  const click = createDismissEntireTopicAction('node-1', app.dismiss, () => { closed = true; });
  const before = app.getState().nodesById;
  app.setState({ nodesById: { ...before,
    child: { ...before.child!, parentNodeId: 'other' },
    added: { ...before.other!, id: 'added', parentNodeId: 'node-1' } } });
  click();
  await expect.poll(() => app.getState().appActionHistory.undoStack.length).toBe(1);
  expect(closed).toBe(true);
  for (const id of ['node-1', 'below', 'added']) {
    expect(app.getState().nodesById[id]!.reading?.state).toBe('dismissed');
  }
  for (const id of ['child', 'card', 'other']) expect(app.getState().nodesById[id]!.reading).toBeUndefined();
  expect(app.history.undoWorkspaceAction()).toBe(true);
  await expect.poll(() => app.getState().nodesById.added!.reading ?? null).toBeNull();
  expect(app.getState().nodesById.below!.reading ?? null).toBeNull();
  expect(app.history.redoWorkspaceAction()).toBe(true);
  await expect.poll(() => app.getState().nodesById.added!.reading?.state).toBe('dismissed');
});

it('rejects a missing or changed root and respects the history command guard', () => {
  const app = fixture();
  expect(app.dismiss({ topicRootId: 'missing' }, now)).toBe(false);
  expect(app.dismiss({ topicRootId: 'card' }, now)).toBe(false);
  app.setState({ appActionHistory: { ...app.getState().appActionHistory, applying: { entryId: 'pending', mode: 'undo' } } });
  expect(app.dismiss({ topicRootId: 'node-1' }, now)).toBe(false);
  expect(app.getState().nodesById['node-1']!.reading).toBeUndefined();
});

it('rolls back the entire root operation when reading persistence fails', async () => {
  const app = fixture();
  installWorkspaceHistoryPersistence({ persistNodeSnapshots: async () => false,
    persistReadingSnapshots: async () => false, persistReviewSnapshot: async () => false,
    persistShelveSnapshots: async () => false });
  expect(app.dismiss({ topicRootId: 'node-1' }, now)).toBe(true);
  await expect.poll(() => app.getState().appActionHistory.pendingAction).toBeNull();
  for (const id of ['node-1', 'child', 'below']) expect(app.getState().nodesById[id]!.reading ?? null).toBeNull();
  expect(app.getState().appActionHistory.undoStack).toHaveLength(0);
});
