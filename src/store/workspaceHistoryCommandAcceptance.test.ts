import { afterEach, expect, it } from 'vitest';

import { beginWorkspaceAction } from './workspaceActionHistory';
import { acceptWorkspaceHistoryCommand } from './workspaceHistoryCommandAcceptance';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';
import { createStructureRenameEntry } from './workspaceStructureHistoryEntries';
import { getUndoRouterOwner, setUndoRouterTarget, subscribeUndoRouter } from './workspaceUndoRouter';

afterEach(() => setUndoRouterTarget('workspace', null));

it.each(['workspace', 'preserve'] as const)('accepts a pending command with explicit %s ownership', (ownership) => {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const entry = createStructureRenameEntry({ afterTitle: 'New', beforeTitle: 'Old', kind: 'topic', nodeId: 'node-1' });
  setUndoRouterTarget('content', 'topic-a');
  const routedEntries: (string | undefined)[] = [];
  const unsubscribe = subscribeUndoRouter(() => routedEntries.push(harness.getState().appActionHistory.pendingAction?.entry.id));
  acceptWorkspaceHistoryCommand(harness.setState, ownership, (state) => ({
    appActionHistory: beginWorkspaceAction(state.appActionHistory, entry)
  }));
  expect(harness.getState().appActionHistory.pendingAction?.entry.id).toBe(entry.id);
  expect(getUndoRouterOwner()).toBe(ownership === 'workspace' ? 'workspace' : 'content');
  expect(routedEntries).toEqual(ownership === 'workspace' ? [entry.id] : []);
  unsubscribe();
});

it('does not change ownership when the operation is rejected', () => {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  setUndoRouterTarget('content', 'topic-a');
  acceptWorkspaceHistoryCommand(harness.setState, 'workspace', (state) => state);
  expect(getUndoRouterOwner()).toBe('content');
  expect(harness.getState().appActionHistory.pendingAction).toBeNull();
});
