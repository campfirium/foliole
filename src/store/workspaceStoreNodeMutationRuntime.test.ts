import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { definedProps } from '../shared/lib/definedProps';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import {
  hasWorkspaceNodeMutationRuntime,
  syncCreateNodeMutationToRuntime,
  syncNodeContentWithAnchorsMutationToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeRevealMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

vi.mock('./workspaceNodeDocumentCache', () => ({
  syncWorkspaceNodeDocumentCacheFromNode: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValue(null);
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValue(null);
});

describe('workspace node mutation runtime acceptance', () => {
  it('does not update renderer document cache when runtime rejects content mutation', async () => {
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const applied = await actions.updateNodeContent('node-1', '# Runtime rejected');

    expect(applied).toBe(false);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed');
    expect(syncWorkspaceNodeDocumentCacheFromNode).not.toHaveBeenCalled();
  });

  it('keeps local creation side effects when runtime accepts the created root node', async () => {
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
    vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(async (node, nodeOrder, activeNodeId) => ({
      createdNodeIds: [node.id],
      nodeOrder,
      ...definedProps({ activeNodeId }),
      nodes: [{
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        kind: node.kind,
        title: node.title,
        isTitleManual: node.isTitleManual ?? false,
        content: node.content,
        reveal: node.reveal,
        anchorLink: node.anchorLink ?? null,
        imageRegions: node.imageRegions ?? null,
        position: nodeOrder.indexOf(node.id),
        createdAt: node.createdAt,
        updatedAt: node.updatedAt
      }]
    }));
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const createdNodeId = (await actions.createRootNode())!;

    expect(createdNodeId).toContain('node-');
    expect(harness.getState().activeNodeId).toBe(createdNodeId);
    expect(harness.getState().untitledSequenceByParent[INBOX_NODE_ID]).toBe(1);
  });
});

it('keeps virtual node metadata when runtime accepts a newly created virtual node', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(async (node, nodeOrder, activeNodeId) => ({
    createdNodeIds: [node.id],
    nodeOrder,
    ...definedProps({ activeNodeId }),
    nodes: [{
      nodeId: node.id,
      parentNodeId: node.parentNodeId,
      kind: node.kind,
      title: node.title,
      isTitleManual: node.isTitleManual ?? false,
      content: node.content,
      virtualFilter: node.virtualFilter ?? null,
      reveal: node.reveal,
      anchorLink: node.anchorLink ?? null,
      imageRegions: node.imageRegions ?? null,
      position: nodeOrder.indexOf(node.id),
      createdAt: node.createdAt,
      updatedAt: node.updatedAt
    }]
  }));
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const createdNodeId = (await actions.createVirtualNode())!;

  expect(harness.getState().nodesById[createdNodeId]?.specialKind).toBe('virtual');
});
