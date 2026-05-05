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
  revealSelection?: ReturnType<typeof vi.fn>;
  saveActiveNodeView?: ReturnType<typeof vi.fn>;
}) {
  const revealSelection = args.revealSelection ?? vi.fn();
  const saveActiveNodeView = args.saveActiveNodeView ?? vi.fn();
  const jumpToAncestorNode = args.jumpToAncestorNode ?? vi.fn(() => null);
  const openNode = args.openNode ?? vi.fn(() => null);

  const view = renderHook(
    ({ activeNodeContent, activeNodeId }) =>
      useWorkspaceNavigation({
        activeNodeContent,
        activeNodeId,
        activeNodeParentId: null,
        backStackSize: 0,
        closeContextMenu: vi.fn(),
        editorRef: { current: { revealSelection } as unknown as EditorAdapter },
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

  return { ...view, openNode, revealSelection, saveActiveNodeView };
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

  const { result, rerender, revealSelection } = renderTextLocatorNavigationHook({
    activeNodeContent: 'Alpha Beta Gamma',
    activeNodeId: 'text-hl-child',
    jumpToAncestorNode
  });

  await act(async () => {
    await result.current.handleSelectBreadcrumbNode('node-1');
    rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
  });

  expect(revealSelection).toHaveBeenCalledWith({ from: 6, to: 10 });
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}

async function runRevealTextLocatorDirectSelectionCase() {
  const openNode = vi.fn(() => ({
    focusAnchor: null,
    nodeId: 'node-1'
  }));

  const { result, rerender, revealSelection } = renderTextLocatorNavigationHook({
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
  expect(revealSelection).toHaveBeenCalledWith({ from: 6, to: 10 });
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}

async function runPendingTextLocatorUntilContentAvailableCase() {
  const openNode = vi.fn(() => ({
    focusAnchor: null,
    nodeId: 'node-1'
  }));

  const { result, rerender, revealSelection } = renderTextLocatorNavigationHook({
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

  expect(revealSelection).not.toHaveBeenCalled();

  await act(async () => {
    rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
  });

  expect(revealSelection).toHaveBeenCalledWith({ from: 6, to: 10 });
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
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

  it('does not reveal a text locator when the current plain-text content no longer matches', runUnresolvedLocatorCase);
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

  const { result, rerender, revealSelection } = renderTextLocatorNavigationHook({
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

  expect(revealSelection).not.toHaveBeenCalled();
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

  const { result, rerender, revealSelection } = renderTextLocatorNavigationHook({
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

  expect(revealSelection).toHaveBeenCalledWith({ from: 6, to: 6 });
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
}
