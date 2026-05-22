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
        ...initial.nodesById['node-1']!,
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

it('preserves last opened timestamp when saving reading position', () => {
  const harness = createSetHarness(
    createTestWorkspaceState({
      ...createWorkspaceState(),
      nodeViewById: {
        'node-1': {
          scrollTop: 20,
          selection: { from: 3, to: 4 },
          updatedAt: '2026-04-05T10:00:00.000Z'
        }
      }
    })
  );
  const setNodeViewState = createSetNodeViewStateAction(harness.set);

  setNodeViewState('node-1', {
    scrollTop: 120,
    selection: { from: 30, to: 40 }
  });

  expect(harness.getState().nodeViewById['node-1']).toEqual({
    scrollTop: 120,
    selection: { from: 30, to: 40 },
    updatedAt: '2026-04-05T10:00:00.000Z'
  });
});

it('does not create a last opened timestamp from reading position alone', () => {
  const harness = createSetHarness(createWorkspaceState());
  const setNodeViewState = createSetNodeViewStateAction(harness.set);

  setNodeViewState('node-1', {
    scrollTop: 120,
    selection: null
  });

  expect(harness.getState().nodeViewById['node-1']).toEqual({
    scrollTop: 120,
    selection: null,
    updatedAt: null
  });
});
