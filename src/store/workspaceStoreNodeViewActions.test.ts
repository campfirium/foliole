import { expect, it, vi } from 'vitest';

import { createTestWorkspaceState } from '../test/workspaceStateTestSupport';

import type { WorkspaceState } from './workspaceStore';
import { createSetNodeViewStateAction } from './workspaceStoreNodeViewActions';

type WorkspaceSetInput =
  | WorkspaceState
  | Partial<WorkspaceState>
  | ((snapshot: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>);

function createWorkspaceState(): WorkspaceState {
  const initial = createTestWorkspaceState();
  return createTestWorkspaceState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodeViewById: {},
    nodesById: {
      'node-1': {
        ...initial.nodesById['node-1'],
        id: 'node-1',
        parentNodeId: null,
        kind: 'topic',
        title: 'Node 1',
        content: '',
        reveal: null,
        review: null,
        anchorLink: null,
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:00.000Z'
      }
    }
  });
}

function createSetHarness(initialState: WorkspaceState) {
  let state = initialState;
  const set = vi.fn((partial: WorkspaceSetInput) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  });
  return {
    getState: () => state,
    set
  };
}

it('does not update workspace state when node view payload is unchanged', () => {
  const harness = createSetHarness(createWorkspaceState());
  const setNodeViewState = createSetNodeViewStateAction(harness.set);

  setNodeViewState('node-1', {
    scrollTop: 20,
    selection: { from: 3, to: 4 }
  });
  const firstNodeViewById = harness.getState().nodeViewById;

  setNodeViewState('node-1', {
    scrollTop: 20,
    selection: { from: 3, to: 4 }
  });

  expect(harness.getState().nodeViewById).toBe(firstNodeViewById);
  expect(harness.set).toHaveBeenCalledTimes(2);
});
