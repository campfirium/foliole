import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
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
  hasWorkspaceNodeMutationRuntime: vi.fn(() => true),
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

beforeEach(() => {
  vi.clearAllMocks();
  resetNodeContentVersionGuardForTests();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValue(null);
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValue(null);
});

it('keeps body edits when root creation confirmation returns the stale created node body', async () => {
  vi.useFakeTimers();
  try {
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

    await actions.updateNodeContent(createdNodeId, 'Typed body before create confirmation');
    const current = harness.getState().nodesById[createdNodeId]!;

    resolveCreateMutation({
      activeNodeId: createdNodeId,
      createdNodeIds: [createdNodeId],
      nodeOrder: harness.getState().nodeOrder,
      nodes: [{
        nodeId: createdNodeId,
        parentNodeId: INBOX_NODE_ID,
        kind: 'topic',
        title: current.title,
        isTitleManual: current.isTitleManual ?? false,
        content: '',
        reveal: null,
        anchorLink: null,
        position: harness.getState().nodeOrder.indexOf(createdNodeId),
        createdAt: current.createdAt,
        updatedAt: current.updatedAt
      }]
    });
    await createPromise;

    expect(harness.getState().nodesById[createdNodeId]?.content).toBe('Typed body before create confirmation');
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

it('waits for root creation confirmation before persisting typed body content', async () => {
  vi.useFakeTimers();
  try {
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
    await actions.updateNodeContent(createdNodeId, 'Typed body before create confirmation');
    await vi.advanceTimersByTimeAsync(1000);

    expect(syncNodeContentWithAnchorsMutationToRuntime).not.toHaveBeenCalled();

    resolveCreateMutation({
      activeNodeId: createdNodeId,
      createdNodeIds: [createdNodeId],
      nodeOrder: harness.getState().nodeOrder,
      nodes: []
    });
    await createPromise;

    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Typed body before create confirmation',
        id: createdNodeId
      }),
      [],
      expect.any(Array)
    );
    expect(vi.mocked(syncCreateNodeMutationToRuntime).mock.invocationCallOrder[0]!)
      .toBeLessThan(vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mock.invocationCallOrder[0]!);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
