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

describe('useWorkspaceNavigation text locator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceNavigationTestState();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  it('reveals text locator breadcrumbs inside the editor', async () => {
    const saveActiveNodeView = vi.fn();
    const revealSelection = vi.fn();
    const jumpToAncestorNode = vi.fn(() => ({
      focusAnchor: {
        id: 'text-hl-1',
        kind: 'highlight' as const,
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      nodeId: 'node-1'
    }));

    const { result, rerender } = renderHook(
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
          openNode: vi.fn(() => null),
          saveActiveNodeView
        }),
      { initialProps: { activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'text-hl-child' } }
    );

    await act(async () => {
      await result.current.handleSelectBreadcrumbNode('node-1');
      rerender({ activeNodeContent: 'Alpha Beta Gamma', activeNodeId: 'node-1' });
    });

    expect(revealSelection).toHaveBeenCalledWith({ from: 6, to: 10 });
    expect(requestPdfAnchorJump).not.toHaveBeenCalled();
  });
});
