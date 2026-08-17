import { expect, it } from 'vitest';

import {
  createEmptyWorkspaceActionHistory,
  pushWorkspaceUndoEntry
} from './workspaceActionHistory';
import type { WorkspacePersistedState, WorkspaceState } from './workspaceStore';
import {
  createWorkspaceNodeActionsFixture
} from './workspaceStoreNodeActions.test-support';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';
import type { WorkspaceStructureRenameEntry } from './workspaceStructureHistoryTypes';

function renameEntry(index: number): WorkspaceStructureRenameEntry {
  return {
    afterTitle: `After ${index}`,
    beforeTitle: `Before ${index}`,
    id: `entry-${index}`,
    kind: 'topic',
    nodeId: 'node-1',
    title: 'Rename Topic',
    type: 'structure.rename'
  };
}

it('keeps only the latest 50 committed workspace actions', () => {
  let history = createEmptyWorkspaceActionHistory();
  for (let index = 0; index < 55; index += 1) {
    history = pushWorkspaceUndoEntry(history, renameEntry(index));
  }

  expect(history.undoStack).toHaveLength(50);
  expect(history.undoStack[0]?.id).toBe('entry-5');
  expect(history.undoStack.at(-1)?.id).toBe('entry-54');
});

it('clears session-only workspace history during rehydrate', () => {
  const current: WorkspaceState = {
    ...createWorkspaceNodeActionsFixture(),
    appActionHistory: pushWorkspaceUndoEntry(createEmptyWorkspaceActionHistory(), renameEntry(1))
  };
  const config = createWorkspaceStorePersistConfig(() => undefined);
  const merged = config.merge?.({} as WorkspacePersistedState, current) as WorkspaceState;

  expect(merged.appActionHistory).toEqual(createEmptyWorkspaceActionHistory());
});
