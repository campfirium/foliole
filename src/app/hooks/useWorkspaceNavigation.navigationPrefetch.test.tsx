import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import { resetWorkspaceNodeDocumentPrefetchForTest } from '../../store/workspaceNodeDocumentPrefetch';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import {
  createNavigationActionMock,
  createPrefetchInvokeMock,
  navigationTestNodes,
  resetWorkspaceNavigationTestState,
  seedNavigationPrefetchState,
  trackPrefetchCallOrder
} from './useWorkspaceNavigation.testSupport';

const {
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeSelectionRequested
} = vi.hoisted(() => ({
  markNodeDocumentMerged: vi.fn(),
  markNodeDocumentLoadResolved: vi.fn(),
  markNodeDocumentLoadStarted: vi.fn(),
  markNodeSelectionRequested: vi.fn()
}));

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../shared/platform/performanceDiagnosticsProbe', () => ({
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeSelectionRequested
}));

function createNavigationPrefetchHookHarness(args: {
  actionName: string;
  actionResult: NodeNavigationResult | null;
  activeNodeId?: string;
  backStack?: string[];
  forwardStack?: string[];
  nodesById?: Record<string, Node>;
}) {
  const callOrder = trackPrefetchCallOrder({
    markNodeDocumentMerged,
    markNodeDocumentLoadResolved,
    markNodeDocumentLoadStarted,
    markNodeSelectionRequested
  });
  const invoke = createPrefetchInvokeMock();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  seedNavigationPrefetchState(args);

  const action = createNavigationActionMock(callOrder, args.actionName, args.actionResult);
  const saveActiveNodeView = vi.fn(() => {
    callOrder.push('save-view');
  });

  const view = renderHook(() =>
    useWorkspaceNavigation({
      activeNodeContent: 'Loaded node 2 body',
      activeNodeId: args.activeNodeId ?? 'node-2',
      activeNodeParentId:
        args.activeNodeId && args.nodesById ? args.nodesById[args.activeNodeId]?.parentNodeId ?? null : null,
      backStackSize: (args.backStack ?? []).length,
      beginAnchorNavigationRestore: vi.fn(),
      closeContextMenu: vi.fn(),
      completeAnchorNavigationRestore: vi.fn(),
      editorRef: { current: null },
      forwardStackSize: (args.forwardStack ?? []).length,
      goBack: args.actionName === 'go-back' ? action : vi.fn(() => null),
      goForward: args.actionName === 'go-forward' ? action : vi.fn(() => null),
      goToParent: args.actionName === 'go-parent' ? action : vi.fn(() => null),
      jumpToAncestorNode: vi.fn(() => null),
      nodesById: useWorkspaceStore.getState().nodesById,
      openNode: vi.fn(() => null),
      saveActiveNodeView
    })
  );

  return { action, callOrder, invoke, view };
}

async function expectPreparedNavigationResult(args: {
  actionName: string;
  actionResult: NodeNavigationResult | null;
  backStack?: string[];
  forwardStack?: string[];
  activeNodeId?: string;
  nodesById?: typeof navigationTestNodes;
  expectedTargetNodeId: string;
}) {
  const { action, callOrder, invoke, view } = createNavigationPrefetchHookHarness(args);

  await act(async () => {
    if (args.actionName === 'go-back') {
      view.result.current.handleGoBack();
    } else if (args.actionName === 'go-forward') {
      view.result.current.handleGoForward();
    } else {
      view.result.current.handleGoParent();
    }
    await Promise.resolve();
  });

  expect(callOrder).toEqual([
    'selection-requested',
    args.actionName,
    'save-view',
    'load-started',
    'load-resolved',
    'load-merged'
  ]);
  expect(action).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls).toEqual([['load_node_document', { nodeId: args.expectedTargetNodeId }]]);
}

describe('useWorkspaceNavigation navigation hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceNodeDocumentPrefetchForTest();
    resetWorkspaceNavigationTestState();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  it('navigates back immediately and then hydrates the previous node', async () => {
    await expectPreparedNavigationResult({
      actionName: 'go-back',
      actionResult: { focusAnchor: null, nodeId: 'node-1' },
      backStack: ['node-1'],
      expectedTargetNodeId: 'node-1'
    });
  });

  it('navigates forward immediately and then hydrates the forward target', async () => {
    await expectPreparedNavigationResult({
      actionName: 'go-forward',
      actionResult: { focusAnchor: null, nodeId: 'node-1' },
      forwardStack: ['node-1'],
      expectedTargetNodeId: 'node-1'
    });
  });

  it('navigates upward immediately and then hydrates the parent node', async () => {
    const parentNodes = {
      ...navigationTestNodes,
      'node-1': {
        ...navigationTestNodes['node-1'],
        content: '',
        hasContent: true,
        hasReveal: false
      },
      child: {
        ...navigationTestNodes['node-2'],
        id: 'child',
        parentNodeId: 'node-1',
        content: 'Loaded child body',
        hasContent: true,
        hasReveal: false,
        title: 'Child'
      }
    };

    await expectPreparedNavigationResult({
      actionName: 'go-parent',
      actionResult: { focusAnchor: null, nodeId: 'node-1' },
      activeNodeId: 'child',
      expectedTargetNodeId: 'node-1',
      nodesById: parentNodes
    });
  });
});
