import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

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
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(async (payload: { nodeIds: string[]; nodeOrder: string[] }) => ({
    nodeOrder: payload.nodeOrder,
    removedNodeIds: payload.nodeIds
  })),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRelearnNodeToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn(async (payload: { nodeIds: string[] }) => ({ deletedNodeIds: payload.nodeIds }))
}));

function createUnresolvedLocatorHighlightHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodesById['node-1'] = {
    ...fixture.nodesById['node-1']!,
    content: 'before answer after',
    title: 'Parent'
  };
  fixture.nodeOrder = [...fixture.nodeOrder, 'node-highlight'];
  fixture.nodesById['node-highlight']! = {
    id: 'node-highlight',
    parentNodeId: 'node-1',
    kind: 'topic',
    title: 'answer',
    isTitleManual: false,
    hideTitleHeading: false,
    hasContent: true,
    content: 'answer',
    anchorLink: {
      id: 'anchor-1',
      kind: 'highlight',
      locator: { from: 7, originalText: 'answer', to: 7 }
    },
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z'
  };
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const actions = createWorkspaceNodeActions(harness.setState);
  return { actions, harness };
}

function expectParentDocumentUntouched(harness: ReturnType<typeof createUnresolvedLocatorHighlightHarness>['harness']) {
  expect(harness.getState().nodesById['node-1']?.content).toBe('before answer after');
}

describe('createWorkspaceNodeActions soft delete sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs soft delete command through runtime bridge without rewriting locator-backed parents', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeContent('node-1', 'before answer after');
    const nodeId = await actions.createQANodeFromSelection('node-1', 'Prompt [...]', 'answer', '1', {
      id: '1',
      kind: 'cloze',
      locator: {
        from: 'before answer after'.indexOf('answer'),
        originalText: 'answer',
        to: 'before answer after'.indexOf('answer') + 'answer'.length
      }
    });
    if (!nodeId) {
      throw new Error('expected QA node id');
    }

    vi.clearAllMocks();
    await actions.deleteNode(nodeId);

    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledWith({
      nodeIds: [nodeId],
      deletedAt: expect.any(String)
    });
  });

  it('syncs multi-select soft delete through one runtime bridge command', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const firstNodeId = (await actions.createRootNode('root 2'))!;
    const secondNodeId = (await actions.createRootNode('root 3'))!;

    vi.clearAllMocks();
    await actions.deleteNodes([firstNodeId, secondNodeId]);

    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledWith({
      nodeIds: expect.arrayContaining([firstNodeId, secondNodeId]),
      deletedAt: expect.any(String)
    });
  });

  it('syncs restore command through runtime bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const nodeId = (await actions.createChildNode('node-1', 'child'))!;

    await actions.deleteNode(nodeId);
    vi.clearAllMocks();
    vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({ restoredNodeIds: [nodeId], skippedConflicts: [] });
    await actions.restoreNode(nodeId);

    expect(syncRestoreNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: [nodeId] });
  });

});

describe('createWorkspaceNodeActions trash root normalization sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores the highest trashed ancestor when a covered child is requested', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const parentNodeId = (await actions.createRootNode('Folder', 'folder'))!;
    const childNodeId = (await actions.createChildNode(parentNodeId, 'Topic'))!;

    await actions.deleteNode(parentNodeId);
    vi.clearAllMocks();
    vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({
      restoredNodeIds: [parentNodeId, childNodeId],
      skippedConflicts: []
    });
    await actions.restoreNode(childNodeId);

    expect(syncRestoreNodesToRuntime).toHaveBeenCalledTimes(1);
    expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: [parentNodeId, childNodeId] });
    expect(harness.getState().trashedNodeIds).not.toContain(parentNodeId);
    expect(harness.getState().trashedNodeIds).not.toContain(childNodeId);
  });
});

describe('createWorkspaceNodeActions unresolved locator lifecycle sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft deletes and restores unresolved locator highlights without rewriting the parent document', async () => {
    const { actions, harness } = createUnresolvedLocatorHighlightHarness();

    vi.clearAllMocks();
    await actions.deleteNode('node-highlight');

    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncSoftDeleteNodesToRuntime).toHaveBeenCalledWith({
      nodeIds: ['node-highlight'],
      deletedAt: expect.any(String)
    });
    expectParentDocumentUntouched(harness);

    vi.clearAllMocks();
    vi.mocked(syncRestoreNodesToRuntime).mockResolvedValue({
      restoredNodeIds: ['node-highlight'],
      skippedConflicts: []
    });
    await actions.restoreNode('node-highlight');

    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncRestoreNodesToRuntime).toHaveBeenCalledWith({ nodeIds: ['node-highlight'] });
    expect(harness.getState().trashedNodeIds).toEqual([]);
    expectParentDocumentUntouched(harness);
  });

  it('permanently deletes unresolved locator highlights without rewriting the parent document', async () => {
    const { actions, harness } = createUnresolvedLocatorHighlightHarness();

    await actions.deleteNode('node-highlight');
    vi.clearAllMocks();
    await actions.deleteNodePermanently('node-highlight');

    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncDeleteNodesPermanentlyToRuntime).toHaveBeenCalledWith({
      nodeIds: ['node-highlight'],
      nodeOrder: [HOME_NODE_ID, INBOX_NODE_ID, 'special-virtual-root', 'node-1']
    });
    expectParentDocumentUntouched(harness);
    expect(harness.getState().nodesById['node-highlight']!).toBeUndefined();
  });
});
