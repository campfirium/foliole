import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  syncCreateNodeMutationToRuntime,
  syncMoveNodesToRuntime,
  syncNodeContentMutationToRuntime,
  syncNodeContentToRuntime,
  syncNodeContentWithAnchorsToRuntime,
  syncNodeContentWithAnchorsMutationToRuntime,
  syncNodeOrderToRuntime
} from './workspaceRuntimeSync';
import { deferNodeContentRuntimePersist } from './workspaceStoreContentRuntimePersist';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

function registerContentEditCoverage() {
  it('clears imported title-heading hiding after manual content edits', async () => {
    vi.useFakeTimers();
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const node = harness.getState().nodesById['node-1']!;
    if (!node) throw new Error('missing seed node');
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': { ...node, hideTitleHeading: true }
      }
    });
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeContent('node-1', '# Updated title\n\nBody');
    await vi.advanceTimersByTimeAsync(800);

    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        hideTitleHeading: false,
        title: 'Updated title'
      }),
      [],
      expect.any(Array)
    );
  });

  it('ignores content edits until the node document is fully loaded', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const node = harness.getState().nodesById['node-1']!;
    if (!node) throw new Error('missing seed node');
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': {
          ...node,
          content: '',
          hasContent: true,
          reveal: null,
          hasReveal: true
        }
      }
    });
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeContent('node-1', 'Typed too early');

    expect(harness.getState().nodesById['node-1']!).toMatchObject({
      content: '',
      hasContent: true,
      reveal: null,
      hasReveal: true
    });
    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentWithAnchorsToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentWithAnchorsMutationToRuntime).not.toHaveBeenCalled();
  });
}

function registerDerivedTitleCoverage() {
  it('syncs automatic title derivation separately from content edits', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeDerivedTitle('node-1', '# Updated title\n\nBody');

    expect(syncNodeContentMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        isTitleManual: false,
        title: 'Updated title'
      })
    );
  });
}

describe('workspaceStoreNodeActions extra sync coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerContentEditCoverage();
  registerDerivedTitleCoverage();

  it('defers pending content runtime persistence while the editor keeps changing', async () => {
    vi.useFakeTimers();
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeContent('node-1', 'First draft');
    await vi.advanceTimersByTimeAsync(700);
    deferNodeContentRuntimePersist('node-1');
    await vi.advanceTimersByTimeAsync(200);

    expect(syncNodeContentWithAnchorsMutationToRuntime).not.toHaveBeenCalled();

    await actions.updateNodeContent('node-1', 'Latest draft');
    await vi.advanceTimersByTimeAsync(800);

    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        content: 'Latest draft'
      }),
      [],
      expect.any(Array)
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('workspaceStoreNodeActions extra sync coverage command bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs create qa nodes through runtime command bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const nodeId = await actions.createQANodeFromSelection('node-1', 'Prompt', 'Answer', 'cloze-1', {
      id: 'cloze-1',
      kind: 'cloze',
      locator: {
        from: 0,
        originalText: 'Answer',
        to: 6
      }
    });

    expect(nodeId).not.toBeNull();
    expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
    expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: nodeId,
        parentNodeId: 'node-1',
        content: 'Prompt',
        reveal: 'Answer',
        anchorLink: {
          id: 'cloze-1',
          kind: 'cloze',
          locator: {
            from: 0,
            originalText: 'Answer',
            to: 6
          }
        }
      }),
      expect.any(Array),
      'node-1',
      expect.any(Number)
    );
  });

  it('syncs moved root nodes through runtime command bridge', async () => {
    vi.mocked(syncMoveNodesToRuntime).mockImplementation(async (payload) => ({
      movedNodeIds: payload.nodes.map((node) => node.nodeId),
      nodeOrder: payload.nodeOrder
    }));
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const firstFolderId = (await actions.createRootNode('Folder A', 'folder'))!;
    const secondFolderId = (await actions.createRootNode('Folder B', 'folder'))!;

    vi.clearAllMocks();
    const moved = await actions.moveNodes([secondFolderId], firstFolderId, 'before');

    expect(moved).toBe(true);
    expect(syncMoveNodesToRuntime).toHaveBeenCalledWith(expect.objectContaining({
      nodeOrder: expect.arrayContaining([secondFolderId, firstFolderId]),
      nodes: [expect.objectContaining({ nodeId: secondFolderId, parentNodeId: null })]
    }));
    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
  });
});
