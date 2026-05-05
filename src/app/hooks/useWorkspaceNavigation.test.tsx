import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';

describe('useWorkspaceNavigation', () => {
  it('saves the current reading position before selecting another node', () => {
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
  });
});
