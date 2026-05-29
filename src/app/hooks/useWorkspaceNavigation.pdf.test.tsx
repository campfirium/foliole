import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { createMockEditorAdapter } from '../../test/editorAdapterTestSupport';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import {
  navigationTestNodes,
  resetWorkspaceNavigationTestState
} from './useWorkspaceNavigation.testSupport';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemRegistry', () => ({
  requestPdfAnchorJump
}));

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../shared/platform/performanceDiagnosticsProbe', () => ({
  markNodeDocumentMerged: vi.fn(),
  markNodeDocumentLoadResolved: vi.fn(),
  markNodeDocumentLoadStarted: vi.fn(),
  markNodePositionRequested: vi.fn(),
  markNodeSelectionApplied: vi.fn(),
  markNodeSelectionRequested: vi.fn()
}));

function createPdfBreadcrumbHarness(args: {
  activeNodeContent: string;
  editorRef: { current: unknown };
  locator: { page: number; x: number; y: number };
}) {
  const jumpToAncestorNode = vi.fn(() => ({
    focusAnchor: {
      id: `pdf-hl-${args.locator.page}`,
      kind: 'highlight' as const,
      locator: args.locator
    },
    nodeId: 'pdf-parent'
  }));

  return renderHook(
    ({ activeNodeId }) =>
      useWorkspaceNavigation({
        activeNodeContent: args.activeNodeContent,
        activeNodeId,
        activeNodeParentId: null,
        backStackSize: 0,
        beginAnchorNavigationRestore: vi.fn(),
        closeContextMenu: vi.fn(),
        completeAnchorNavigationRestore: vi.fn(),
        editorRef: args.editorRef as never,
        flushPendingEditorDraft: vi.fn(),
        flushPendingEditorDraftImmediately: vi.fn().mockResolvedValue(true),
        forwardStackSize: 0,
        goBack: vi.fn(() => null),
        goForward: vi.fn(() => null),
        goToParent: vi.fn(() => null),
        jumpToAncestorNode,
        nodesById: navigationTestNodes,
        openNode: vi.fn(() => null),
        saveActiveNodeView: vi.fn()
      }),
    { initialProps: { activeNodeId: 'pdf-hl-child' } }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceNavigationTestState();
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
});

describe('useWorkspaceNavigation pdf breadcrumb jumps', () => {
  it('requests a pdf anchor jump when breadcrumb navigation lands on a pdf parent node', async () => {
    const view = createPdfBreadcrumbHarness({
      activeNodeContent: '',
      editorRef: { current: null },
      locator: { page: 5, x: 0.35, y: 0.7 }
    });

    await act(async () => {
      await view.result.current.handleSelectBreadcrumbNode('pdf-parent');
      view.rerender({ activeNodeId: 'pdf-parent' });
    });

    expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', { page: 5, x: 0.35, y: 0.7 });
  });

  it('still requests a pdf anchor jump when editor ref still exists', async () => {
    const revealSelection = vi.fn();
    const view = createPdfBreadcrumbHarness({
      activeNodeContent: 'plain markdown',
      editorRef: { current: createMockEditorAdapter({ revealSelection }) },
      locator: { page: 9, x: 0.1, y: 0.25 }
    });

    await act(async () => {
      await view.result.current.handleSelectBreadcrumbNode('pdf-parent');
      view.rerender({ activeNodeId: 'pdf-parent' });
    });

    expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', { page: 9, x: 0.1, y: 0.25 });
    expect(revealSelection).not.toHaveBeenCalled();
  });
});
