import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import {
  createPrefetchInvokeMock,
  navigationTestNodes,
  resetWorkspaceNavigationTestState,
  seedPrefetchTestState,
  trackPrefetchCallOrder
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
        closeContextMenu: vi.fn(),
        editorRef: { current: null },
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
        closeContextMenu: vi.fn(),
        editorRef: { current: editorAdapter },
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

async function runSavePositionBeforeNodeSelectionTest() {
  const callOrder: string[] = [];
  const openNode = vi.fn(() => {
    callOrder.push('open-node');
    return { focusAnchor: null, nodeId: 'node-2' };
  });
  const saveActiveNodeView = vi.fn(() => {
    callOrder.push('save-view');
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
      closeContextMenu: vi.fn(),
      editorRef: { current: null },
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

  expect(callOrder).toEqual(['selection-requested', 'save-view', 'open-node']);
  expect(markNodeSelectionRequested).toHaveBeenCalledWith('node-2', navigationTestNodes);
}

function createPrefetchHookHarness(callOrder: string[]) {
  const openNode = vi.fn(() => {
    callOrder.push('open-node');
    useWorkspaceStore.getState().setActiveNode('node-2');
    return { focusAnchor: null, nodeId: 'node-2' };
  });
  const saveActiveNodeView = vi.fn(() => {
    callOrder.push('save-view');
  });

  const view = renderHook(() =>
    useWorkspaceNavigation({
      activeNodeContent: 'Alpha body',
      activeNodeId: 'node-1',
      activeNodeParentId: null,
      backStackSize: 0,
      closeContextMenu: vi.fn(),
      editorRef: { current: null },
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

  return { openNode, view };
}

async function runPrefetchBeforeNodeSelectionTest() {
  seedPrefetchTestState();
  const invoke = createPrefetchInvokeMock();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  const callOrder = trackPrefetchCallOrder({
    markNodeDocumentMerged,
    markNodeDocumentLoadResolved,
    markNodeDocumentLoadStarted,
    markNodeSelectionRequested
  });
  const { openNode, view } = createPrefetchHookHarness(callOrder);

  await act(async () => {
    await view.result.current.handleSelectNode('node-2');
  });

  expect(callOrder).toEqual([
    'selection-requested',
    'save-view',
    'load-started',
    'load-resolved',
    'load-merged'
  ]);
  expect(openNode).not.toHaveBeenCalled();
  expect(invoke.mock.calls).toEqual([['load_node_document', { nodeId: 'node-2' }]]);
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
    content: 'Loaded node 2 body',
    hasContent: true
  });
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

  it('saves the current reading position before selecting another node', async () => {
    await runSavePositionBeforeNodeSelectionTest();
  });

it('opens a cold target only after its document is prepared', async () => {
  await runPrefetchBeforeNodeSelectionTest();
});
});
