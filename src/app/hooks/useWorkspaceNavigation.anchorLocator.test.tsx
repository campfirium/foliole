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
  openNode?: ReturnType<typeof vi.fn>;
  saveActiveNodeView?: ReturnType<typeof vi.fn>;
}) {
  const beginAnchorNavigationRestore = args.beginAnchorNavigationRestore ?? vi.fn();
  const saveActiveNodeView = args.saveActiveNodeView ?? vi.fn();
  const flushPendingEditorDraft = vi.fn();
  const jumpToAncestorNode = args.jumpToAncestorNode ?? vi.fn(() => null);
  const openNode = args.openNode ?? vi.fn(() => null);

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
        editorRef: {
          current: {
            isPositionNearViewportRatio: () => true
          } as unknown as EditorAdapter
        },
        flushPendingEditorDraft,
        forwardStackSize: 0,
        goBack: vi.fn(() => null),
        goForward: vi.fn(() => null),
        goToParent: vi.fn(() => null),
        jumpToAncestorNode,
        nodesById: navigationTestNodes,
        openNode,
        saveActiveNodeView
      }),
    { initialProps: { activeNodeContent: args.activeNodeContent, activeNodeId: args.activeNodeId } }
  );

  return { ...view, beginAnchorNavigationRestore, openNode };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceNavigationTestState();
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
});

async function runRestoreSuppressionCase() {
  vi.useFakeTimers();
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) => window.clearTimeout(handle)) as typeof cancelAnimationFrame;

  try {
    const jumpToAncestorNode = vi.fn(() => ({
      focusAnchor: {
        id: 'text-hl-restore-1',
        kind: 'highlight' as const,
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      nodeId: 'node-1'
    }));

    const { beginAnchorNavigationRestore, result, rerender } = renderTextLocatorNavigationHook({
      activeNodeContent: 'Alpha Beta Gamma',
      activeNodeId: 'text-hl-child',
      jumpToAncestorNode
    });

    await act(async () => {
      await result.current.handleSelectBreadcrumbNode('node-1');
      rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
    });

    expect(beginAnchorNavigationRestore).toHaveBeenLastCalledWith('node-1', { from: 6, to: 6 });
    expect(result.current.shouldSuppressSelectionRestore()).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(40);
    });

    expect(result.current.shouldSuppressSelectionRestore()).toBe(false);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.useRealTimers();
  }
}

describe('useWorkspaceNavigation text locator basics', () => {
  it('reveals text locator breadcrumbs inside the unified reading-position flow', async () => {
    const jumpToAncestorNode = vi.fn(() => ({
      focusAnchor: {
        id: 'text-hl-1',
        kind: 'highlight' as const,
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      nodeId: 'node-1'
    }));

    const { beginAnchorNavigationRestore, result, rerender } = renderTextLocatorNavigationHook({
      activeNodeContent: 'Alpha Beta Gamma',
      activeNodeId: 'text-hl-child',
      jumpToAncestorNode
    });

    await act(async () => {
      await result.current.handleSelectBreadcrumbNode('node-1');
      rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
    });

    expect(beginAnchorNavigationRestore).toHaveBeenLastCalledWith('node-1', { from: 6, to: 6 });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });

  it('reveals text locator focus after selecting a different node directly', async () => {
    const openNode = vi.fn(() => ({ focusAnchor: null, nodeId: 'node-1' }));
    const { beginAnchorNavigationRestore, result, rerender } = renderTextLocatorNavigationHook({
      activeNodeContent: 'Other node',
      activeNodeId: 'node-2',
      openNode
    });

    await act(async () => {
      await result.current.handleSelectNode('node-1', {
        id: 'text-hl-3',
        kind: 'highlight',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      });
      rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
    });

    expect(openNode).toHaveBeenCalledWith('node-1');
    expect(beginAnchorNavigationRestore).toHaveBeenLastCalledWith('node-1', { from: 6, to: 6 });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });

});

describe('useWorkspaceNavigation text locator pending flow', () => {
  it('keeps pending text locator focus until the target document content becomes available', async () => {
    const openNode = vi.fn(() => ({ focusAnchor: null, nodeId: 'node-1' }));
    const { beginAnchorNavigationRestore, result, rerender } = renderTextLocatorNavigationHook({
      activeNodeContent: null,
      activeNodeId: 'node-2',
      openNode
    });

    await act(async () => {
      await result.current.handleSelectNode('node-1', {
        id: 'text-hl-4',
        kind: 'highlight',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      });
      rerender({ activeNodeContent: null, activeNodeId: 'node-1' });
    });

    expect(beginAnchorNavigationRestore).toHaveBeenCalledTimes(1);
    expect(beginAnchorNavigationRestore).toHaveBeenCalledWith('node-1', { from: 6, to: 6 });

    await act(async () => {
      rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
    });

    expect(beginAnchorNavigationRestore).toHaveBeenCalledTimes(1);
    expect(beginAnchorNavigationRestore).toHaveBeenLastCalledWith('node-1', { from: 6, to: 6 });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });

  it('keeps restore suppression active until the anchor reveal settles', runRestoreSuppressionCase);
});
