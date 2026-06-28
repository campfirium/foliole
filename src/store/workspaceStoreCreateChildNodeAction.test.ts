import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { createInitialWorkspaceState, type WorkspaceState } from './workspaceStore';
import {
  drainPendingNodeContentRuntimePersists
} from './workspaceStoreContentRuntimePersist';
import { createChildNodeAction } from './workspaceStoreCreateChildNodeAction';

vi.mock('./workspaceStoreContentRuntimePersist', () => ({
  completeNodeCreateRuntimePersist: vi.fn(async () => true),
  drainPendingNodeContentRuntimePersists: vi.fn(async () => true)
}));

function createHarness() {
  let state = createInitialWorkspaceState(new Date('2026-06-28T00:00:00.000Z')) as WorkspaceState;
  const set = vi.fn((partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  });
  const onNodeCreated = vi.fn(async () => null);
  const createChildNode = createChildNodeAction(set, onNodeCreated);
  return {
    createChildNode,
    getState: () => state,
    onNodeCreated
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('drains pending content runtime persist before creating the next child node', async () => {
  const harness = createHarness();

  const createdNodeId = await harness.createChildNode(INBOX_NODE_ID, '', 'topic');

  expect(createdNodeId).toBeTruthy();
  expect(drainPendingNodeContentRuntimePersists).toHaveBeenCalledTimes(1);
  expect(harness.onNodeCreated).toHaveBeenCalledTimes(1);
  expect(vi.mocked(drainPendingNodeContentRuntimePersists).mock.invocationCallOrder[0])
    .toBeLessThan(harness.onNodeCreated.mock.invocationCallOrder[0] ?? 0);
  expect(harness.getState().activeNodeId).toBe(createdNodeId);
});
