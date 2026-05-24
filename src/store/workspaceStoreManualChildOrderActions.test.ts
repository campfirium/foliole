import { expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { createSetFolderManualChildOrderAction } from './workspaceStoreManualChildOrderActions';
import type { WorkspaceState } from './workspaceStoreTypes';

vi.mock('./workspaceRuntimeSync', () => ({
  syncNodeContentToRuntime: vi.fn()
}));

function node(overrides: Partial<Node> & Pick<Node, 'id' | 'kind'>): Node {
  return {
    ...overrides,
    content: '',
    createdAt: '2026-05-21T00:00:00.000Z',
    hideTitleHeading: false,
    id: overrides.id,
    kind: overrides.kind,
    parentNodeId: null,
    reveal: null,
    review: null,
    title: overrides.id,
    updatedAt: '2026-05-21T00:00:00.000Z'
  };
}

it('manual child order updates only the folder node', () => {
  let state = {
    nodesById: {
      folder: node({ id: 'folder', kind: 'folder' }),
      child: node({ id: 'child', kind: 'topic', parentNodeId: 'folder' })
    }
  } as unknown as WorkspaceState;
  const set = (partial: WorkspaceState | Partial<WorkspaceState> | ((current: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  };
  const action = createSetFolderManualChildOrderAction(set);

  expect(action('folder', ['child'], '2026-05-22T00:00:00.000Z')).toBe(true);
  expect(state.nodesById.folder?.manualChildOrder).toEqual(['child']);
  expect(state.nodesById.folder?.updatedAt).toBe('2026-05-22T00:00:00.000Z');
  expect(state.nodesById.child?.updatedAt).toBe('2026-05-21T00:00:00.000Z');
});
