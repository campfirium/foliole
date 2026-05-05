import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

function runPdfBreadcrumbJumpTest() {
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
        openNode: vi.fn(() => null),
        saveActiveNodeView
      }),
    { initialProps: { activeNodeId: 'pdf-hl-child' } }
  );

  act(() => {
    result.current.handleSelectBreadcrumbNode('pdf-parent');
    rerender({ activeNodeId: 'pdf-parent' });
  });

  expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', { page: 5, x: 0.35, y: 0.7 });
}

function runPdfBreadcrumbJumpTestWhenEditorRefExists() {
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
        openNode: vi.fn(() => null),
        saveActiveNodeView
      }),
    { initialProps: { activeNodeId: 'pdf-hl-child' } }
  );

  act(() => {
    result.current.handleSelectBreadcrumbNode('pdf-parent');
    rerender({ activeNodeId: 'pdf-parent' });
  });

  expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', { page: 9, x: 0.1, y: 0.25 });
  expect(revealSelection).not.toHaveBeenCalled();
}

function runSavePositionBeforeNodeSelectionTest() {
  const callOrder: string[] = [];
  const openNode = vi.fn(() => {
    callOrder.push('open-node');
    return { focusAnchor: null, nodeId: 'node-2' };
  });
  const saveActiveNodeView = vi.fn(() => {
    callOrder.push('save-view');
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
      openNode,
      saveActiveNodeView
    })
  );

  act(() => {
    result.current.handleSelectNode('node-2');
  });

  expect(callOrder).toEqual(['save-view', 'open-node']);
}

describe('useWorkspaceNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests a pdf anchor jump when breadcrumb navigation lands on a pdf parent node', runPdfBreadcrumbJumpTest);

  it('still requests a pdf anchor jump when editor ref still exists', runPdfBreadcrumbJumpTestWhenEditorRefExists);

  it('saves the current reading position before selecting another node', runSavePositionBeforeNodeSelectionTest);
});
