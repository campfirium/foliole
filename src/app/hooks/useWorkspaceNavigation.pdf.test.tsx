import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PdfSelectionLocator } from '../../features/nodes/model/nodeTypes';
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
  locator: PdfSelectionLocator;
}) {
  const jumpToAncestorNode = vi.fn(() => ({
    focusAnchor: {
      id: 'pdf-anchor',
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
  it('returns to the first document fragment for a cross-page excerpt', async () => {
    const pages = [2, 5].map(page => ({ page, x: 0.2, y: 0.3, rects: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.1 }] }));
    const view = createPdfBreadcrumbHarness({ activeNodeContent: '', editorRef: { current: null }, locator: { pages } });
    await act(async () => {
      await view.result.current.handleSelectBreadcrumbNode('pdf-parent');
      view.rerender({ activeNodeId: 'pdf-parent' });
    });
    expect(requestPdfAnchorJump).toHaveBeenCalledWith('pdf-parent', pages[0]);
  });

});
