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
  syncMoveNodesToRuntime: vi.fn(async () => undefined),
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
  it('keeps editor content local when native persistence rejects content mutation', async () => {
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const applied = await actions.updateNodeContent('node-1', '# Runtime rejected');

    expect(applied).toBe(true);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Runtime rejected');
    expect(syncWorkspaceNodeDocumentCacheFromNode).toHaveBeenCalledWith(expect.objectContaining({
      content: '# Runtime rejected',
      id: 'node-1'
    }));
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

it('keeps root creation content local when native persistence rejects creation mutation', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValueOnce(null);
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const createdNodeId = (await actions.createRootNode('# Local root'))!;

  expect(createdNodeId).toContain('node-');
  expect(harness.getState().activeNodeId).toBe(createdNodeId);
  expect(harness.getState().nodesById[createdNodeId]?.content).toBe('# Local root');
});

it('keeps body edits made before root creation confirmation', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
    let resolveCreateMutation!: (
      value: Awaited<ReturnType<typeof syncCreateNodeMutationToRuntime>>
    ) => void;
    vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveCreateMutation = resolve;
      })
    );
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const createPromise = actions.createRootNode('');
    const createdNodeId = harness.getState().activeNodeId!;
    expect(createdNodeId).toContain('node-');

    await actions.updateNodeContent(createdNodeId, 'Typed body before create confirmation');
    expect(harness.getState().nodesById[createdNodeId]?.content).toBe('Typed body before create confirmation');

    resolveCreateMutation({
      activeNodeId: createdNodeId,
      createdNodeIds: [createdNodeId],
      nodeOrder: harness.getState().nodeOrder,
      nodes: []
    });
    await createPromise;

    expect(harness.getState().nodesById[createdNodeId]?.content).toBe('Typed body before create confirmation');
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

it('keeps child creation content local when native persistence rejects creation mutation', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValueOnce(null);
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const createdNodeId = (await actions.createChildNode('node-1', 'Local child'))!;

  expect(createdNodeId).toContain('node-');
  expect(harness.getState().activeNodeId).toBe(createdNodeId);
  expect(harness.getState().nodesById[createdNodeId]?.content).toBe('Local child');
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
