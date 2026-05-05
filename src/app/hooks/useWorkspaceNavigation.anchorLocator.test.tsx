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
  jumpToAncestorNode?: ReturnType<typeof vi.fn>;
  openNode?: ReturnType<typeof vi.fn>;
  revealPosition?: ReturnType<typeof vi.fn>;
  saveActiveNodeView?: ReturnType<typeof vi.fn>;
}) {
  const revealPosition = args.revealPosition ?? vi.fn();
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
        beginAnchorNavigationRestore: vi.fn(),
        closeContextMenu: vi.fn(),
        completeAnchorNavigationRestore: vi.fn(),
        editorRef: {
          current: {
            isPositionNearViewportRatio: () => true,
            revealPosition
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

  return { ...view, openNode, revealPosition, saveActiveNodeView };
}

async function runRevealTextLocatorBreadcrumbCase() {
  const jumpToAncestorNode = vi.fn(() => ({
    focusAnchor: {
      id: 'text-hl-1',
      kind: 'highlight' as const,
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    nodeId: 'node-1'
  }));

  const { result, rerender, revealPosition } = renderTextLocatorNavigationHook({
    activeNodeContent: 'Alpha Beta Gamma',
    activeNodeId: 'text-hl-child',
    jumpToAncestorNode
  });

  await act(async () => {
    await result.current.handleSelectBreadcrumbNode('node-1');
    rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
  });

  expect(revealPosition).toHaveBeenCalledWith(6);
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}

async function runRevealTextLocatorDirectSelectionCase() {
  const openNode = vi.fn(() => ({
    focusAnchor: null,
    nodeId: 'node-1'
  }));

  const { result, rerender, revealPosition } = renderTextLocatorNavigationHook({
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
  expect(revealPosition).toHaveBeenCalledWith(6);
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}

async function runPendingTextLocatorUntilContentAvailableCase() {
  const openNode = vi.fn(() => ({
    focusAnchor: null,
    nodeId: 'node-1'
  }));

  const { result, rerender, revealPosition } = renderTextLocatorNavigationHook({
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

  expect(revealPosition).not.toHaveBeenCalled();

  await act(async () => {
    rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
  });

  expect(revealPosition).toHaveBeenCalledWith(6);
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}

async function runRestoreSuppressionLifetimeCase() {
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

    const { result, rerender, revealPosition } = renderTextLocatorNavigationHook({
      activeNodeContent: 'Alpha Beta Gamma',
      activeNodeId: 'text-hl-child',
      jumpToAncestorNode
    });

    await act(async () => {
      await result.current.handleSelectBreadcrumbNode('node-1');
      rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
    });

    expect(revealPosition).toHaveBeenCalledWith(6);
    expect(result.current.shouldSuppressSelectionRestore()).toBe(true);

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

async function runRevealAfterEditorReadyCase() {
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
    const revealPosition = vi.fn();
    const editorRef: { current: EditorAdapter | null } = { current: null };

    const view = renderHook(
      ({ activeNodeContent, activeNodeId }) =>
        useWorkspaceNavigation({
          activeNodeContent,
          activeNodeId,
          activeNodeParentId: null,
          backStackSize: 0,
          beginAnchorNavigationRestore: vi.fn(),
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

    expect(revealPosition).not.toHaveBeenCalled();

    editorRef.current = {
      isPositionNearViewportRatio: () => true,
      revealPosition
    } as unknown as EditorAdapter;

    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(revealPosition).toHaveBeenCalledWith(6);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.useRealTimers();
  }
}

describe('useWorkspaceNavigation text locator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceNavigationTestState();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  it('reveals text locator breadcrumbs inside the editor', runRevealTextLocatorBreadcrumbCase);

  it('reveals text locator focus after selecting a different node directly', runRevealTextLocatorDirectSelectionCase);

  it('keeps pending text locator focus until the target document content becomes available', runPendingTextLocatorUntilContentAvailableCase);

  it('keeps restore suppression active until the anchor reveal settles', runRestoreSuppressionLifetimeCase);

  it('retries pending text locator reveal after the target editor becomes ready', runRevealAfterEditorReadyCase);

  it('keeps using stored text locator offsets even when the current plain-text content no longer matches', runUnresolvedLocatorCase);
  it('reveals unresolved zero-width text locators at their stored position', runUnresolvedZeroWidthLocatorCase);
});

async function runUnresolvedLocatorCase() {
  const content = 'Start Legacy End';
  const jumpToAncestorNode = vi.fn(() => ({
    focusAnchor: {
      id: 'text-hl-1',
      kind: 'highlight' as const,
      locator: { from: 0, originalText: 'Beta', to: 4 }
    },
    nodeId: 'node-1'
  }));

  const { result, rerender, revealPosition } = renderTextLocatorNavigationHook({
    activeNodeContent: content,
    activeNodeId: 'text-hl-child',
    jumpToAncestorNode
  });

  await act(async () => {
    await result.current.handleSelectBreadcrumbNode('node-1');
    rerender({
      activeNodeContent: content,
      activeNodeId: 'node-1'
    });
  });

  expect(revealPosition).toHaveBeenCalledWith(0);
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}

async function runUnresolvedZeroWidthLocatorCase() {
  const content = 'Alpha  Gamma';
  const jumpToAncestorNode = vi.fn(() => ({
    focusAnchor: {
      id: 'text-hl-2',
      kind: 'highlight' as const,
      locator: { from: 6, originalText: 'Beta', to: 6 }
    },
    nodeId: 'node-1'
  }));

  const { result, rerender, revealPosition } = renderTextLocatorNavigationHook({
    activeNodeContent: content,
    activeNodeId: 'text-hl-child',
    jumpToAncestorNode
  });

  await act(async () => {
    await result.current.handleSelectBreadcrumbNode('node-1');
    rerender({
      activeNodeContent: content,
      activeNodeId: 'node-1'
    });
  });

  expect(revealPosition).toHaveBeenCalledWith(6);
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}
