import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { definedProps } from '../shared/lib/definedProps';

import { resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import {
  hasWorkspaceNodeMutationRuntime,
  syncCreateNodeMutationToRuntime,
  syncNodeContentWithAnchorsMutationToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createClozeLocator,
  createHighlightLocator,
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(),
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
  resetNodeContentVersionGuardForTests();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValue(null);
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValue(null);
});

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

it('keeps editor content in store when local publication is deferred', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const applied = await actions.updateNodeContent('node-1', '# Deferred local publication', { publishLocal: false });

    expect(applied).toBe(true);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Deferred local publication');
    expect(syncWorkspaceNodeDocumentCacheFromNode).toHaveBeenCalledWith(expect.objectContaining({
      content: '# Deferred local publication',
      id: 'node-1'
    }));
    expect(syncNodeContentWithAnchorsMutationToRuntime).not.toHaveBeenCalled();
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
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

it('rolls back root creation when native persistence rejects the canonical mutation', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValueOnce(null);
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const createdNodeId = await actions.createRootNode('# Local root');

  expect(createdNodeId).toBeNull();
  expect(harness.getState().activeNodeId).toBe('node-1');
  expect(Object.values(harness.getState().nodesById)).not.toContainEqual(expect.objectContaining({ content: '# Local root' }));
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
    const creationOrder = [...harness.getState().nodeOrder];
    expect(createdNodeId).toContain('node-');

    await actions.updateNodeContent(createdNodeId, 'Typed body before create confirmation');
    expect(harness.getState().nodesById[createdNodeId]?.content).toBe('Typed body before create confirmation');
    const switchedOrder = [...harness.getState().nodeOrder].reverse();
    harness.setState({
      activeNodeId: 'node-1',
      nodeOrder: switchedOrder,
      reviewSession: {
        currentNodeId: 'node-1',
        isAnswerRevealed: false,
        queueNodeIds: ['node-1'],
        totalNodeCount: 1
      }
    });

    resolveCreateMutation({
      activeNodeId: createdNodeId,
      createdNodeIds: [createdNodeId],
      nodeOrder: creationOrder,
      nodes: []
    });
    await createPromise;

    expect(harness.getState().nodesById[createdNodeId]?.content).toBe('Typed body before create confirmation');
    expect(harness.getState().activeNodeId).toBe('node-1');
    expect(harness.getState().nodeOrder).toEqual(switchedOrder);
    expect(harness.getState().reviewSession.currentNodeId).toBe('node-1');
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});


it('rolls back child creation when native persistence rejects the canonical mutation', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValueOnce(null);
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const createdNodeId = await actions.createChildNode('node-1', 'Local child');

  expect(createdNodeId).toBeNull();
  expect(harness.getState().activeNodeId).toBe('node-1');
  expect(Object.values(harness.getState().nodesById)).not.toContainEqual(expect.objectContaining({ content: 'Local child' }));
});

it('caches selection highlight content before runtime creation confirmation', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(async (node, nodeOrder) => ({
    createdNodeIds: [node.id],
    nodeOrder,
    nodes: []
  }));
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const createdNodeId = (await actions.createHighlightNodeFromSelection(
    'node-1',
    ' Selected excerpt ',
    'hl-1',
    createHighlightLocator('hl-1', 'Selected excerpt')
  ))!;

  expect(createdNodeId).toContain('node-');
  expect(syncWorkspaceNodeDocumentCacheFromNode).toHaveBeenCalledWith(expect.objectContaining({
    content: 'Selected excerpt',
    id: createdNodeId,
    title: 'Selected excerpt'
  }));
});

it('caches selection cloze prompt and reveal before runtime creation confirmation', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(async (node, nodeOrder) => ({
    createdNodeIds: [node.id],
    nodeOrder,
    nodes: []
  }));
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceNodeActions(harness.setState);

  const createdNodeId = (await actions.createQANodeFromSelection(
    'node-1',
    'Prompt [...]',
    ' hidden answer ',
    'cloze-1',
    createClozeLocator('cloze-1', 'hidden answer')
  ))!;

  expect(createdNodeId).toContain('node-');
  expect(syncWorkspaceNodeDocumentCacheFromNode).toHaveBeenCalledWith(expect.objectContaining({
    content: 'Prompt [...]',
    id: createdNodeId,
    reveal: 'hidden answer'
  }));
});

it('keeps manual virtual folder metadata when runtime accepts its creation', async () => {
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

  const createdNodeId = (await actions.createVirtualNode({ mode: 'manual' }))!;

  expect(harness.getState().nodesById[createdNodeId]).toMatchObject({
    specialKind: 'virtual',
    virtualFilter: {
      conditions: [{ field: 'manual', operator: 'equals', value: 'manual-child-order' }],
      match: 'all',
      version: 1
    }
  });
});
