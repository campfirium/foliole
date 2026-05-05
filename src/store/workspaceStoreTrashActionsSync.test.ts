import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  syncDeleteNodesPermanentlyToRuntime,
  syncNodeContentToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRelearnNodeToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

describe('createWorkspaceNodeActions soft delete sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs soft delete command through runtime bridge without rewriting locator-backed parents', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('node-1', 'before <cloze id="1">answer</cloze id="1"> after');
    const nodeId = actions.createQANodeFromSelection('node-1', 'Prompt [...]', 'answer', '1', {
      id: '1',
      kind: 'cloze'
    });
    if (!nodeId) {
      throw new Error('expected QA node id');
    }

    vi.clearAllMocks();
    actions.deleteNode(nodeId);

    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledWith({
      nodeIds: [nodeId],
      deletedAt: expect.any(String)
    });
  });

  it('syncs multi-select soft delete through one runtime bridge command', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const firstNodeId = actions.createRootNode('root 2');
    const secondNodeId = actions.createRootNode('root 3');

    vi.clearAllMocks();
    actions.deleteNodes([firstNodeId, secondNodeId]);

    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledWith({
      nodeIds: expect.arrayContaining([firstNodeId, secondNodeId]),
      deletedAt: expect.any(String)
    });
  });

  it('syncs restore command through runtime bridge', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const nodeId = actions.createChildNode('node-1', 'child');

    actions.deleteNode(nodeId);
    vi.clearAllMocks();
    actions.restoreNode(nodeId);

    expect(syncRestoreNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: [nodeId] });
  });
});

describe('createWorkspaceNodeActions permanent delete sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs permanent delete command with next node order through runtime bridge', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const nodeId = actions.createRootNode('root 2');

    vi.clearAllMocks();
    actions.deleteNodePermanently(nodeId);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: [nodeId],
      nodeOrder: [INBOX_NODE_ID, 'special-virtual-root', 'node-1']
    });
  });

  it('syncs multi-select permanent delete through one runtime bridge command', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const firstNodeId = actions.createRootNode('root 2');
    const secondNodeId = actions.createRootNode('root 3');

    vi.clearAllMocks();
    actions.deleteNodesPermanently([firstNodeId, secondNodeId]);

    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledTimes(1);
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: expect.arrayContaining([firstNodeId, secondNodeId]),
      nodeOrder: [INBOX_NODE_ID, 'special-virtual-root', 'node-1']
    });
  });

  it('does not sync when deleting a missing node', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.deleteNode('missing-node');

    expect(syncSoftDeleteNodesToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
  });
});
