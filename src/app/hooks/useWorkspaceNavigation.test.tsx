import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/bridge';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import {
  navigationTestNodes,
  resetWorkspaceNavigationTestState,
} from './useWorkspaceNavigation.testSupport';

const {
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeSelectionApplied,
  markNodeSelectionRequested,
  requestPdfAnchorJump
} = vi.hoisted(() => ({
  markNodeDocumentMerged: vi.fn(),
  markNodeDocumentLoadResolved: vi.fn(),
  markNodeDocumentLoadStarted: vi.fn(),
  markNodeSelectionApplied: vi.fn(),
  markNodeSelectionRequested: vi.fn(),
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../shared/platform/performanceDiagnosticsProbe', () => ({
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeSelectionApplied,
  markNodeSelectionRequested
}));

async function runPdfBreadcrumbJumpTest() {
  const saveActiveNodeView = vi.fn();
  const flushPendingEditorDraft = vi.fn();
  const flushPendingEditorDraftImmediately = vi.fn().mockResolvedValue(true);
  const jumpToAncestorNode = vi.fn(() => ({
    focusAnchor: {
      id: 'pdf-hl-1',
      kind: 'highlight' as const,
      locator: { page: 5, x: 0.35, y: 0.7 }
    },
    nodeId: 'pdf-parent'
  }));

  const { result, rerender } = renderHook(
    ({ activeNodeId }) =>
      useWorkspaceNavigation({
        activeNodeContent: '',
        activeNodeId,
        activeNodeParentId: null,
        backStackSize: 0,
        beginAnchorNavigationRestore: vi.fn(),
        closeContextMenu: vi.fn(),
        completeAnchorNavigationRestore: vi.fn(),
        editorRef: { current: null },
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
      }),
    { initialProps: { activeNodeId: 'pdf-hl-child' } }
  );

  await act(async () => {
    await result.current.handleSelectBreadcrumbNode('pdf-parent');
    rerender({ activeNodeId: 'pdf-parent' });
  });

  expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', { page: 5, x: 0.35, y: 0.7 });
}

async function runPdfBreadcrumbJumpTestWhenEditorRefExists() {
  const saveActiveNodeView = vi.fn();
  const flushPendingEditorDraft = vi.fn();
  const flushPendingEditorDraftImmediately = vi.fn().mockResolvedValue(true);
  const jumpToAncestorNode = vi.fn(() => ({
    focusAnchor: {
      id: 'pdf-hl-2',
      kind: 'highlight' as const,
      locator: { page: 9, x: 0.1, y: 0.25 }
    },
    nodeId: 'pdf-parent'
  }));
  const revealSelection = vi.fn();
  const editorAdapter = { revealSelection } as unknown as EditorAdapter;

  const { result, rerender } = renderHook(
    ({ activeNodeId }) =>
      useWorkspaceNavigation({
        activeNodeContent: 'plain markdown',
        activeNodeId,
        activeNodeParentId: null,
        backStackSize: 0,
        beginAnchorNavigationRestore: vi.fn(),
        closeContextMenu: vi.fn(),
        completeAnchorNavigationRestore: vi.fn(),
        editorRef: { current: editorAdapter },
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
      }),
    { initialProps: { activeNodeId: 'pdf-hl-child' } }
  );

  await act(async () => {
    await result.current.handleSelectBreadcrumbNode('pdf-parent');
    rerender({ activeNodeId: 'pdf-parent' });
  });

  expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', { page: 9, x: 0.1, y: 0.25 });
  expect(revealSelection).not.toHaveBeenCalled();
}

async function runBreadcrumbSelectionOrderTest() {
  const callOrder: string[] = [];
  const saveActiveNodeView = vi.fn(() => {
    callOrder.push('save-view');
  });
  const flushPendingEditorDraft = vi.fn(() => {
    callOrder.push('flush-draft');
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

  expect(callOrder).toEqual(['selection-requested', 'flush-draft', 'flush-draft-immediate', 'save-view', 'jump-node']);
  expect(saveActiveNodeView).toHaveBeenCalledWith('node-2');
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

  expect(callOrder).toEqual(['selection-requested', 'flush-draft', 'flush-draft-immediate', 'save-view', 'open-node']);
  expect(markNodeSelectionRequested).toHaveBeenCalledWith('node-2', navigationTestNodes);
}

describe('useWorkspaceNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceNavigationTestState();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  it('requests a pdf anchor jump when breadcrumb navigation lands on a pdf parent node', async () => {
    await runPdfBreadcrumbJumpTest();
  });

  it('still requests a pdf anchor jump when editor ref still exists', async () => {
    await runPdfBreadcrumbJumpTestWhenEditorRefExists();
  });

  it('updates the breadcrumb target before saving the current node view', async () => {
    await runBreadcrumbSelectionOrderTest();
  });

  it('saves the current reading position before selecting another node', async () => {
    await runSavePositionBeforeNodeSelectionTest();
  });
});
