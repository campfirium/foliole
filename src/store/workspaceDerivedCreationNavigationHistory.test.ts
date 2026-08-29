import { beforeEach, expect, it, vi } from 'vitest';

import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';

import { createEditorAnnotationCreateEntry } from './workspaceEditorAnnotationOperationEntry';
import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import { hasWorkspaceNodeMutationRuntime, syncCreateNodeMutationToRuntime } from './workspaceRuntimeSync';
import { createWorkspaceNavigationActions } from './workspaceStoreNavigationActions';
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValue(null);
});

function createHarness() {
  const fixture = createWorkspaceNodeActionsFixture();
  fixture.nodeViewById['node-1'] = { scrollTop: 120, selection: { from: 2, to: 6 } };
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  harness.setState({
    ...createWorkspaceNavigationActions(harness.setState),
    ...createWorkspaceNodeActions(harness.setState, harness.getState),
    ...createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState)
  });
  return harness;
}

async function createHighlight(harness: ReturnType<typeof createHarness>, text = 'Seed') {
  return (await harness.getState().createHighlightNodeFromSelection(
    'node-1', text, `anchor-${text}`, createHighlightLocator(`anchor-${text}`, text)
  ))!;
}

it('revisits accepted derived creations in creation order without changing source state or structure order', async () => {
  const harness = createHarness();
  harness.setState({ navigation: { backStack: [], forwardStack: ['old-forward'] } });
  const beforeView = harness.getState().nodeViewById['node-1'];

  const highlightId = await createHighlight(harness, 'First');
  const clozeId = (await harness.getState().createQANodeFromSelection(
    'node-1', 'Second [...]', 'answer', 'anchor-second', { id: 'anchor-second', kind: 'cloze' }
  ))!;

  expect(harness.getState()).toMatchObject({
    activeNodeId: 'node-1',
    navigation: { backStack: [highlightId, clozeId], forwardStack: [] }
  });
  expect(harness.getState().nodeViewById['node-1']).toEqual(beforeView);
  expect(harness.getState().nodeOrder.slice(-2)).toEqual([highlightId, clozeId]);

  expect(harness.getState().goBack()?.nodeId).toBe(clozeId);
  expect(harness.getState().goBack()?.nodeId).toBe(highlightId);
  expect(harness.getState().goForward()?.nodeId).toBe(clozeId);
  expect(harness.getState().goForward()?.nodeId).toBe('node-1');
});

it('keeps ordinary navigation ahead of an earlier creation visit', async () => {
  const harness = createHarness();
  const createdId = await createHighlight(harness);
  const otherNode = { ...harness.getState().nodesById['node-1']!, id: 'node-2', title: 'Other' };
  harness.setState((state) => ({
    nodeOrder: [...state.nodeOrder, otherNode.id],
    nodesById: { ...state.nodesById, [otherNode.id]: otherNode }
  }));

  harness.getState().openNode(otherNode.id);

  expect(harness.getState().goBack()?.nodeId).toBe('node-1');
  expect(harness.getState().goBack()?.nodeId).toBe(createdId);
});

it('does not register a late creation after the live source has changed', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  let resolveCreate!: (value: Awaited<ReturnType<typeof syncCreateNodeMutationToRuntime>>) => void;
  vi.mocked(syncCreateNodeMutationToRuntime).mockImplementationOnce(() => new Promise((resolve) => {
    resolveCreate = resolve;
  }));
  const harness = createHarness();
  const creation = createHighlight(harness);
  const createdId = harness.getState().nodeOrder.at(-1)!;
  const otherNode = { ...harness.getState().nodesById['node-1']!, id: 'node-2', title: 'Other' };
  harness.setState((state) => ({
    activeNodeId: otherNode.id,
    nodeOrder: [...state.nodeOrder, otherNode.id],
    nodesById: { ...state.nodesById, [otherNode.id]: otherNode }
  }));
  resolveCreate({ createdNodeIds: [createdId], nodeOrder: harness.getState().nodeOrder, nodes: [] });

  await creation;

  expect(harness.getState().activeNodeId).toBe(otherNode.id);
  expect(harness.getState().navigation.backStack).toEqual([]);
});

it('does not register a failed creation and removes its optimistic node', async () => {
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncCreateNodeMutationToRuntime).mockResolvedValueOnce(null);
  const harness = createHarness();

  expect(await createHighlight(harness)).toBeNull();
  expect(harness.getState().navigation.backStack).toEqual([]);
  expect(harness.getState().nodeOrder).toHaveLength(4);
});

it('removes an undone creation visit and does not register it again on redo', async () => {
  const harness = createHarness();
  const createdId = await createHighlight(harness);
  expect(harness.getState().navigation.backStack).toEqual([createdId]);

  expect(harness.getState().undoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(createdId));
  expect(harness.getState().navigation.backStack).toEqual([]);

  expect(harness.getState().redoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(createdId));
  expect(harness.getState().navigation.backStack).toEqual([]);
});

it('registers a confirmed batch so the last accepted node is visited first', () => {
  const harness = createHarness();
  const source = harness.getState().nodesById['node-1']!;
  const createdNodes = ['derived-1', 'derived-2'].map((id) => ({
    ...source, anchorLink: { id: `anchor-${id}`, kind: 'highlight' as const }, id, parentNodeId: source.id
  }));
  const nodeOrder = [...harness.getState().nodeOrder, ...createdNodes.map(({ id }) => id)];
  const entry = createEditorAnnotationCreateEntry(createdNodes, source.id, nodeOrder)!;
  harness.setState((state) => ({
    editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, entry),
    nodeOrder,
    nodesById: { ...state.nodesById, ...Object.fromEntries(createdNodes.map((node) => [node.id, node])) }
  }));

  harness.getState().settleEditorAnnotationCreation({
    annotationNodeIds: createdNodes.map(({ id }) => id), nodeId: source.id, succeeded: true
  });

  expect(harness.getState().navigation.backStack).toEqual(['derived-1', 'derived-2']);
  expect(harness.getState().goBack()?.nodeId).toBe('derived-2');
});
