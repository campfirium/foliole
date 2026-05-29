import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import {
  navigationTestNodes,
  resetWorkspaceNavigationTestState
} from './useWorkspaceNavigation.testSupport';

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

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceNavigationTestState();
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
});

describe('useWorkspaceNavigation fast selection', () => {
  it('selects the next node before the runtime dirty flush settles', async () => {
    const callOrder: string[] = [];
    const immediateFlush = { resolve: null as (() => void) | null };
    const openNode = vi.fn(() => {
      callOrder.push('open-node');
      return { focusAnchor: null, nodeId: 'node-2' };
    });

    const { result } = renderHook(() =>
      useWorkspaceNavigation({
        activeNodeContent: 'Alpha body',
        activeNodeId: 'node-1',
        activeNodeParentId: null,
        backStackSize: 0,
        beginAnchorNavigationRestore: vi.fn(),
        closeContextMenu: vi.fn(),
        completeAnchorNavigationRestore: vi.fn(),
        editorRef: { current: null },
        flushPendingEditorDraft: vi.fn(() => callOrder.push('flush-draft')),
        flushPendingEditorDraftImmediately: vi.fn(
          () =>
            new Promise<boolean>((resolve) => {
              callOrder.push('flush-draft-immediate-start');
              immediateFlush.resolve = () => resolve(true);
            })
        ),
        forwardStackSize: 0,
        goBack: vi.fn(() => null),
        goForward: vi.fn(() => null),
        goToParent: vi.fn(() => null),
        jumpToAncestorNode: vi.fn(() => null),
        nodesById: navigationTestNodes,
        openNode,
        saveActiveNodeView: vi.fn(() => callOrder.push('save-view'))
      })
    );

    await act(async () => {
      await result.current.handleSelectNode('node-2');
    });

    expect(callOrder).toEqual(['flush-draft', 'save-view', 'open-node', 'flush-draft-immediate-start']);
    expect(immediateFlush.resolve).toBeTypeOf('function');
    const resolveImmediateFlush = immediateFlush.resolve;
    if (resolveImmediateFlush) {
      resolveImmediateFlush();
    }
  });
});
