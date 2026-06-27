import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import {
  navigationTestNodes,
  resetWorkspaceNavigationTestState,
} from './useWorkspaceNavigation.testSupport';

const {
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodePositionRequested,
  markNodeSelectionApplied,
  markNodeSelectionRequested
} = vi.hoisted(() => ({
  markNodeDocumentMerged: vi.fn(),
  markNodeDocumentLoadResolved: vi.fn(),
  markNodeDocumentLoadStarted: vi.fn(),
  markNodePositionRequested: vi.fn(),
  markNodeSelectionApplied: vi.fn(),
  markNodeSelectionRequested: vi.fn()
}));

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../shared/platform/performanceDiagnosticsProbe', () => ({
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodePositionRequested,
  markNodeSelectionApplied,
  markNodeSelectionRequested
}));

async function runBreadcrumbSelectionOrderTest() {
  const callOrder: string[] = [];
  const saveActiveNodeView = vi.fn(() => {
    callOrder.push('save-view');
  });
  const flushPendingEditorDraft = vi.fn(() => {
    callOrder.push('flush-draft');
  });
  const flushActiveEditorTransaction = vi.fn(() => {
    callOrder.push('fresh-transaction');
    return true;
  });
  const flushPendingEditorDraftImmediately = vi.fn(async () => {
    callOrder.push('flush-draft-immediate');
    return true;
  });
  const jumpToAncestorNode = vi.fn(() => {
    callOrder.push('jump-node');
    return { focusAnchor: null, nodeId: 'node-1' };
  });
  markNodeSelectionRequested.mockImplementation(() => {
    callOrder.push('selection-requested');
  });

  const { result } = renderHook(() =>
    useWorkspaceNavigation({
      activeNodeContent: 'Child body',
      activeNodeId: 'node-2',
      activeNodeParentId: 'node-1',
      backStackSize: 0,
      beginAnchorNavigationRestore: vi.fn(),
      closeContextMenu: vi.fn(),
      completeAnchorNavigationRestore: vi.fn(),
      editorRef: { current: null },
      flushActiveEditorTransaction,
      flushPendingEditorDraft,
      flushPendingEditorDraftImmediately,
      forwardStackSize: 0,
      goBack: vi.fn(() => null),
      goForward: vi.fn(() => null),
      goToParent: vi.fn(() => null),
      jumpToAncestorNode,
      nodesById: navigationTestNodes,
      openNode: vi.fn(() => null),
      saveActiveNodeView
    })
  );

  await act(async () => {
    await result.current.handleSelectBreadcrumbNode('node-1');
  });

  expect(callOrder).toEqual(['selection-requested', 'fresh-transaction', 'save-view', 'jump-node', 'flush-draft-immediate']);
  expect(saveActiveNodeView).toHaveBeenCalledWith('node-2');
  expect(flushActiveEditorTransaction).toHaveBeenCalledWith('node-2');
}

async function runSavePositionBeforeNodeSelectionTest() {
  const callOrder: string[] = [];
  const openNode = vi.fn(() => {
    callOrder.push('open-node');
    return { focusAnchor: null, nodeId: 'node-2' };
  });
  const saveActiveNodeView = vi.fn(() => {
    callOrder.push('save-view');
  });
  const flushPendingEditorDraft = vi.fn(() => {
    callOrder.push('flush-draft');
  });
  const flushActiveEditorTransaction = vi.fn(() => {
    callOrder.push('fresh-transaction');
    return true;
  });
  const flushPendingEditorDraftImmediately = vi.fn(async () => {
    callOrder.push('flush-draft-immediate');
    return true;
  });
  markNodeSelectionRequested.mockImplementation(() => {
    callOrder.push('selection-requested');
  });

  const { result } = renderHook(() =>
    useWorkspaceNavigation({
      activeNodeContent: 'Alpha body',
      activeNodeId: 'node-1',
      activeNodeParentId: null,
      backStackSize: 0,
      beginAnchorNavigationRestore: vi.fn(),
      closeContextMenu: vi.fn(),
      completeAnchorNavigationRestore: vi.fn(),
      editorRef: { current: null },
      flushActiveEditorTransaction,
      flushPendingEditorDraft,
      flushPendingEditorDraftImmediately,
      forwardStackSize: 0,
      goBack: vi.fn(() => null),
      goForward: vi.fn(() => null),
      goToParent: vi.fn(() => null),
      jumpToAncestorNode: vi.fn(() => null),
      nodesById: navigationTestNodes,
      openNode,
      saveActiveNodeView
    })
  );

  await act(async () => {
    await result.current.handleSelectNode('node-2');
  });

  expect(callOrder).toEqual(['selection-requested', 'fresh-transaction', 'save-view', 'open-node', 'flush-draft-immediate']);
  expect(markNodeSelectionRequested).toHaveBeenCalledWith('node-2', navigationTestNodes);
  expect(flushActiveEditorTransaction).toHaveBeenCalledWith('node-1');
}

describe('useWorkspaceNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceNavigationTestState();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  it('updates the breadcrumb target before saving the current node view', async () => {
    await runBreadcrumbSelectionOrderTest();
  });

  it('saves the current reading position before selecting another node', async () => {
    await runSavePositionBeforeNodeSelectionTest();
  });
});
