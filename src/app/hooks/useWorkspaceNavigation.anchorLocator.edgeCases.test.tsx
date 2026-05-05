import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/bridge';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import { navigationTestNodes, resetWorkspaceNavigationTestState } from './useWorkspaceNavigation.testSupport';

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function renderTextLocatorNavigationHook(args: {
  activeNodeContent: string | null;
  activeNodeId: string;
  beginAnchorNavigationRestore?: ReturnType<typeof vi.fn>;
  jumpToAncestorNode?: ReturnType<typeof vi.fn>;
}) {
  const beginAnchorNavigationRestore = args.beginAnchorNavigationRestore ?? vi.fn();

  const view = renderHook(
    ({ activeNodeContent, activeNodeId }) =>
      useWorkspaceNavigation({
        activeNodeContent,
        activeNodeId,
        activeNodeParentId: null,
        backStackSize: 0,
        beginAnchorNavigationRestore,
        closeContextMenu: vi.fn(),
        completeAnchorNavigationRestore: vi.fn(),
        editorRef: { current: null },
        flushPendingEditorDraft: vi.fn(),
        forwardStackSize: 0,
        goBack: vi.fn(() => null),
        goForward: vi.fn(() => null),
        goToParent: vi.fn(() => null),
        jumpToAncestorNode: args.jumpToAncestorNode ?? vi.fn(() => null),
        nodesById: navigationTestNodes,
        openNode: vi.fn(() => null),
        saveActiveNodeView: vi.fn()
      }),
    { initialProps: { activeNodeContent: args.activeNodeContent, activeNodeId: args.activeNodeId } }
  );

  return { ...view, beginAnchorNavigationRestore };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceNavigationTestState();
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
});

async function runEditorIndependenceCase() {
  vi.useFakeTimers();
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) => window.clearTimeout(handle)) as typeof cancelAnimationFrame;

  try {
    const jumpToAncestorNode = vi.fn(() => ({
      focusAnchor: {
        id: 'text-hl-late-editor-1',
        kind: 'highlight' as const,
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      nodeId: 'node-1'
    }));
    const beginAnchorNavigationRestore = vi.fn();
    const editorRef: { current: EditorAdapter | null } = { current: null };

    const view = renderHook(
      ({ activeNodeContent, activeNodeId }) =>
        useWorkspaceNavigation({
          activeNodeContent,
          activeNodeId,
          activeNodeParentId: null,
          backStackSize: 0,
          beginAnchorNavigationRestore,
          closeContextMenu: vi.fn(),
          completeAnchorNavigationRestore: vi.fn(),
          editorRef,
          flushPendingEditorDraft: vi.fn(),
          forwardStackSize: 0,
          goBack: vi.fn(() => null),
          goForward: vi.fn(() => null),
          goToParent: vi.fn(() => null),
          jumpToAncestorNode,
          nodesById: navigationTestNodes,
          openNode: vi.fn(() => null),
          saveActiveNodeView: vi.fn()
        }),
      { initialProps: { activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'text-hl-child' } }
    );

    await act(async () => {
      await view.result.current.handleSelectBreadcrumbNode('node-1');
      view.rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
    });

    expect(beginAnchorNavigationRestore).toHaveBeenCalledWith('node-1', { from: 6, to: 6 });

    editorRef.current = {
      isPositionNearViewportRatio: () => true
    } as unknown as EditorAdapter;

    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(beginAnchorNavigationRestore).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.useRealTimers();
  }
}

describe('useWorkspaceNavigation text locator editor independence', () => {
  it('does not wait for the editor instance before issuing the reading-position request', runEditorIndependenceCase);
});

describe('useWorkspaceNavigation text locator stored offsets', () => {
  it('keeps using stored text locator offsets even when the current plain-text content no longer matches', async () => {
    const content = 'Start Legacy End';
    const jumpToAncestorNode = vi.fn(() => ({
      focusAnchor: {
        id: 'text-hl-1',
        kind: 'highlight' as const,
        locator: { from: 0, originalText: 'Beta', to: 4 }
      },
      nodeId: 'node-1'
    }));

    const { beginAnchorNavigationRestore, result, rerender } = renderTextLocatorNavigationHook({
      activeNodeContent: content,
      activeNodeId: 'text-hl-child',
      jumpToAncestorNode
    });

    await act(async () => {
      await result.current.handleSelectBreadcrumbNode('node-1');
      rerender({ activeNodeContent: content, activeNodeId: 'node-1' });
    });

    expect(beginAnchorNavigationRestore).toHaveBeenLastCalledWith('node-1', { from: 0, to: 0 });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });

  it('reveals unresolved zero-width text locators at their stored position', async () => {
    const content = 'Alpha  Gamma';
    const jumpToAncestorNode = vi.fn(() => ({
      focusAnchor: {
        id: 'text-hl-2',
        kind: 'highlight' as const,
        locator: { from: 6, originalText: 'Beta', to: 6 }
      },
      nodeId: 'node-1'
    }));

    const { beginAnchorNavigationRestore, result, rerender } = renderTextLocatorNavigationHook({
      activeNodeContent: content,
      activeNodeId: 'text-hl-child',
      jumpToAncestorNode
    });

    await act(async () => {
      await result.current.handleSelectBreadcrumbNode('node-1');
      rerender({ activeNodeContent: content, activeNodeId: 'node-1' });
    });

    expect(beginAnchorNavigationRestore).toHaveBeenLastCalledWith('node-1', { from: 6, to: 6 });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });
});
