import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import { hasWorkspaceNodeMutationRuntime } from './workspaceRuntimeSync';
import { resetPendingNodeContentRuntimePersistsForTests } from './workspaceStoreContentRuntimePersist';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createClozeLocator,
  createHighlightLocator,
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(async () => undefined),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeRevealMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn(async ({ nodeIds }: { nodeIds: string[] }) => ({ deletedNodeIds: nodeIds }))
}));

function createHarness() {
  const initial = createWorkspaceNodeActionsFixture();
  initial.nodesById['node-1'] = {
    ...initial.nodesById['node-1']!,
    content: '',
    hasContent: false,
    title: 'Untitled'
  };
  const harness = createWorkspaceNodeActionsSetStateHarness(initial);
  const nodeActions = createWorkspaceNodeActions(harness.setState, harness.getState);
  const historyActions = createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...nodeActions, ...historyActions });
  return { harness, historyActions };
}

function createTextContext(harness: ReturnType<typeof createHarness>['harness']) {
  return {
    applyText: (entry: ReturnType<typeof createTextHistoryEntry>, mode: 'redo' | 'undo') => {
      const content = mode === 'undo' ? entry.beforeContent : entry.afterContent;
      void harness.getState().updateNodeContent(entry.nodeId, content);
      return true;
    },
    currentContent: harness.getState().nodesById['node-1']!.content,
    getCurrentContent: () => harness.getState().nodesById['node-1']!.content,
    nodeId: 'node-1'
  };
}

function getTextLocator(harness: ReturnType<typeof createHarness>['harness'], nodeId: string) {
  return harness.getState().nodesById[nodeId]?.anchorLink?.locator;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(false);
});

afterEach(() => {
  resetPendingNodeContentRuntimePersistsForTests();
});

it('keeps exact annotation anchors while text and soft-deleted annotations are undone and redone', async () => {
  const { harness, historyActions } = createHarness();
  const content = '123456789';
  historyActions.pushEditorOperationEntry(createTextHistoryEntry({
    afterContent: content,
    beforeContent: '',
    nodeId: 'node-1'
  }));
  await harness.getState().updateNodeContent('node-1', content);
  const highlightId = await harness.getState().createHighlightNodeFromSelection(
    'node-1', '3', 'highlight-3', createHighlightLocator('highlight-3', '3', 2)
  );
  const clozeId = await harness.getState().createQANodeFromSelection(
    'node-1', '12345678[...]', '9', 'cloze-9', createClozeLocator('cloze-9', '9', 8)
  );
  expect(highlightId).toBeTruthy();
  expect(clozeId).toBeTruthy();

  expect(historyActions.undoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(clozeId));
  expect(historyActions.undoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(highlightId));
  expect(historyActions.undoEditorOperation(createTextContext(harness))).toBe(true);

  expect(harness.getState().nodesById['node-1']?.content).toBe('');
  expect(getTextLocator(harness, highlightId!)).toEqual({ from: 2, originalText: '3', to: 3 });
  expect(getTextLocator(harness, clozeId!)).toEqual({ from: 8, originalText: '9', to: 9 });

  expect(historyActions.redoEditorOperation(createTextContext(harness))).toBe(true);
  expect(historyActions.redoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(highlightId));
  expect(historyActions.redoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(clozeId));

  expect(harness.getState().nodesById['node-1']?.content).toBe(content);
  expect(getTextLocator(harness, highlightId!)).toEqual({ from: 2, originalText: '3', to: 3 });
  expect(getTextLocator(harness, clozeId!)).toEqual({ from: 8, originalText: '9', to: 9 });
});
