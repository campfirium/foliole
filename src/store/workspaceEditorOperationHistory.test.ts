import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEditorOperationSession } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import { hasWorkspaceNodeMutationRuntime, syncCreateNodeMutationToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createHighlightLocator,
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
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(async () => null),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn(async ({ nodeIds }: { nodeIds: string[] }) => ({ deletedNodeIds: nodeIds }))
}));

function createHarness() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const nodeActions = createWorkspaceNodeActions(harness.setState, harness.getState);
  const historyActions = createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...nodeActions, ...historyActions });
  return { harness, historyActions };
}

function pushTextEdit(historyActions: ReturnType<typeof createWorkspaceEditorOperationHistoryActions>) {
  historyActions.pushEditorOperationEntry(createTextHistoryEntry({
    afterContent: '# Seed\n\nTyped body',
    beforeContent: '# Seed',
    nodeId: 'node-1'
  }));
}

function createTextContext(harness: ReturnType<typeof createHarness>['harness']) {
  return {
    applyText: (entry: ReturnType<typeof createTextHistoryEntry>, mode: 'redo' | 'undo') => {
      const content = mode === 'undo' ? entry.beforeContent : entry.afterContent;
      void harness.getState().updateNodeContent(entry.nodeId, content, { publishLocal: false });
      return true;
    },
    currentContent: harness.getState().nodesById['node-1']!.content,
    nodeId: 'node-1'
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
});

describe('workspace editor text history', () => {
  it('replays text through the supplied editor/save context and moves only that topic stack', async () => {
    const { harness, historyActions } = createHarness();
    pushTextEdit(historyActions);
    await harness.getState().updateNodeContent('node-1', '# Seed\n\nTyped body');

    expect(historyActions.undoEditorOperation(createTextContext(harness))).toBe(true);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed');
    expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').redoStack).toHaveLength(1);

    expect(historyActions.redoEditorOperation(createTextContext(harness))).toBe(true);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed\n\nTyped body');
  });

  it('invalidates only the topic session when current content no longer matches', async () => {
    const { harness, historyActions } = createHarness();
    pushTextEdit(historyActions);
    await harness.getState().updateNodeContent('node-1', '# Seed\n\nOther body');

    expect(historyActions.undoEditorOperation(createTextContext(harness))).toBe(false);
    expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack).toEqual([]);
    expect(harness.getState().editorOperationHistory.invalidations.at(-1)).toEqual({
      nodeId: 'node-1',
      reason: 'current-content-mismatch'
    });
  });

  it('does not consume topic A history while topic B is active', () => {
    const { harness, historyActions } = createHarness();
    pushTextEdit(historyActions);
    harness.setState({ activeNodeId: 'node-b' });

    expect(historyActions.undoEditorOperation()).toBe(false);
    expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack).toHaveLength(1);
  });
});

describe('workspace image excerpt annotation history routing', () => {
  it('replays parent PDF annotation history while its image excerpt child has focus', async () => {
    const { harness, historyActions } = createHarness();
    const createdId = (await harness.getState().createHighlightNodeFromSelection(
      'node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed')
    ))!;
    const createdNode = harness.getState().nodesById[createdId]!;
    harness.setState({
      activeNodeId: createdId,
      nodesById: {
        ...harness.getState().nodesById,
        [createdId]: { ...createdNode, anchorLink: { ...createdNode.anchorLink!, kind: 'image-excerpt' } }
      }
    });

    expect(historyActions.undoEditorOperation({
      applyText: () => false, currentContent: createdNode.content, nodeId: createdId
    })).toBe(true);
    await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(createdId));
    expect(historyActions.redoEditorOperation({
      applyText: () => false, currentContent: createdNode.content, nodeId: createdId
    })).toBe(true);
    await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(createdId));
  });

  it('does not replay parent text history while an image excerpt child has focus', () => {
    const { harness, historyActions } = createHarness();
    pushTextEdit(historyActions);
    const sourceNode = harness.getState().nodesById['node-1']!;
    harness.setState({
      activeNodeId: 'excerpt-1',
      nodeOrder: [...harness.getState().nodeOrder, 'excerpt-1'],
      nodesById: {
        ...harness.getState().nodesById,
        'excerpt-1': {
          ...sourceNode,
          anchorLink: { id: 'excerpt-anchor', kind: 'image-excerpt' },
          id: 'excerpt-1',
          parentNodeId: 'node-1',
          title: 'Excerpt'
        }
      }
    });

    expect(historyActions.undoEditorOperation()).toBe(false);
    expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack).toHaveLength(1);
  });
});

describe('workspace editor annotation history', () => {
  it('waits for canonical create, delete, and restore before moving local annotation state', async () => {
    const { harness, historyActions } = createHarness();
    const createdId = await harness.getState().createHighlightNodeFromSelection(
      'node-1',
      'Seed',
      'anchor-1',
      createHighlightLocator('anchor-1', 'Seed')
    );
    expect(createdId).toBeTruthy();
    expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack.at(-1)).toMatchObject({
      canonical: 'confirmed',
      type: 'annotation.create'
    });

    expect(historyActions.undoEditorOperation()).toBe(true);
    await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(createdId));
    expect(historyActions.redoEditorOperation()).toBe(true);
    await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(createdId));
  });

  it('records user annotation deletion only after the canonical delete succeeds', async () => {
    const { harness, historyActions } = createHarness();
    const createdId = (await harness.getState().createHighlightNodeFromSelection(
      'node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed')
    ))!;
    historyActions.deleteEditorAnnotationNodes([createdId]);
    await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(createdId));

    expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack.at(-1)?.type)
      .toBe('annotation.delete');
    expect(historyActions.undoEditorOperation()).toBe(true);
    await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(createdId));
  });

  it('preserves mixed text and annotation user order in one topic', async () => {
    const { harness, historyActions } = createHarness();
    pushTextEdit(historyActions);
    await harness.getState().updateNodeContent('node-1', '# Seed\n\nTyped body');
    const createdId = await harness.getState().createHighlightNodeFromSelection(
      'node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed')
    );

    expect(historyActions.undoEditorOperation()).toBe(true);
    await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(createdId));
    expect(historyActions.undoEditorOperation(createTextContext(harness))).toBe(true);
    expect(harness.getState().nodesById['node-1']?.content).toBe('# Seed');
  });

});

it('keeps a visible pending annotation at the stack top and serializes undo behind its acknowledgement', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  let resolveCreate!: (value: Awaited<ReturnType<typeof syncCreateNodeMutationToRuntime>>) => void;
  vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(() => new Promise((resolve) => {
    resolveCreate = resolve;
  }));
  const { harness, historyActions } = createHarness();
  pushTextEdit(historyActions);
  const createPromise = harness.getState().createHighlightNodeFromSelection(
    'node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed')
  );
  const createdId = harness.getState().nodeOrder.at(-1)!;

  expect(historyActions.undoEditorOperation()).toBe(true);
  expect(harness.getState().trashedNodeIds).not.toContain(createdId);
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1').undoStack.at(-1))
    .toMatchObject({ canonical: 'pending', type: 'annotation.create' });

  resolveCreate({
    createdNodeIds: [createdId],
    nodeOrder: harness.getState().nodeOrder,
    nodes: []
  });
  await createPromise;
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(createdId));
  expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1')).toMatchObject({
    redoStack: [expect.objectContaining({ canonical: 'confirmed', type: 'annotation.create' })],
    undoStack: [expect.objectContaining({ type: 'text.edit' })]
  });
});

it('does not let a late topic A creation acknowledgement replay topic B state or history', async () => {
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
    let resolveCreate!: (value: Awaited<ReturnType<typeof syncCreateNodeMutationToRuntime>>) => void;
    vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    const { harness, historyActions } = createHarness();
    const createPromise = harness.getState().createHighlightNodeFromSelection(
      'node-1', 'Seed', 'anchor-1', createHighlightLocator('anchor-1', 'Seed')
    );
    const createdId = harness.getState().nodeOrder.at(-1)!;
    const nodeB = { ...harness.getState().nodesById['node-1']!, id: 'node-b', content: 'Topic B', title: 'Topic B' };
    harness.setState({
      activeNodeId: 'node-b',
      nodeOrder: [...harness.getState().nodeOrder, 'node-b'],
      nodesById: { ...harness.getState().nodesById, 'node-b': nodeB }
    });
    historyActions.pushEditorOperationEntry(createTextHistoryEntry({
      afterContent: 'Topic B!', beforeContent: 'Topic B', nodeId: 'node-b'
    }));
    const node = harness.getState().nodesById[createdId]!;
    resolveCreate({
      activeNodeId: 'node-1',
      createdNodeIds: [createdId],
      nodeOrder: ['node-1', createdId],
      nodes: [{
        anchorLink: node.anchorLink ?? null,
        content: node.content,
        createdAt: node.createdAt,
        imageRegions: node.imageRegions ?? null,
        isTitleManual: node.isTitleManual ?? false,
        kind: node.kind,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        position: 1,
        reveal: node.reveal,
        title: node.title,
        updatedAt: node.updatedAt
      }]
    });
    await createPromise;

    expect(harness.getState()).toMatchObject({ activeNodeId: 'node-b' });
    expect(harness.getState().nodeOrder).toContain('node-b');
    expect(harness.getState().nodesById['node-b']?.content).toBe('Topic B');
    expect(getEditorOperationSession(harness.getState().editorOperationHistory, 'node-b').undoStack).toHaveLength(1);
});
