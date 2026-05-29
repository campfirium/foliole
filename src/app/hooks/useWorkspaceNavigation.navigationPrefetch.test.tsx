import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
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

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../shared/platform/performanceDiagnosticsProbe', () => ({
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeSelectionRequested
}));

function createNavigationPrefetchHookHarness(args: {
  actionName: 'go-back' | 'go-forward' | 'go-parent';
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
  const flushPendingEditorDraft = vi.fn(() => {
    callOrder.push('flush-draft');
  });
  const flushPendingEditorDraftImmediately = vi.fn(async () => {
    callOrder.push('flush-draft-immediately');
    return true;
  });
  const editorAdapter = {} as never;
  const editorRef = { current: editorAdapter };

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
      editorRef,
      flushPendingEditorDraft,
      flushPendingEditorDraftImmediately,
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

  return { action, callOrder, editorAdapter, editorRef, invoke, view };
}

async function expectPreparedNavigationResult(args: {
  actionName: 'go-back' | 'go-forward' | 'go-parent';
  actionResult: NodeNavigationResult | null;
  backStack?: string[];
  forwardStack?: string[];
  activeNodeId?: string;
  nodesById?: typeof navigationTestNodes;
  expectedTargetNodeId: string;
}) {
  const { action, callOrder, invoke, view } = createNavigationPrefetchHookHarness(args);

  await triggerPreparedNavigation(view.result.current, args.actionName);
  expectPreparedNavigationEffects({
    action,
    actionName: args.actionName,
    callOrder,
    expectedTargetNodeId: args.expectedTargetNodeId,
    invoke
  });
}

async function triggerPreparedNavigation(
  navigation: Pick<
    ReturnType<typeof useWorkspaceNavigation>,
    'handleGoBack' | 'handleGoForward' | 'handleGoParent'
  >,
  actionName: 'go-back' | 'go-forward' | 'go-parent'
) {
  await act(async () => {
    if (actionName === 'go-back') {
      navigation.handleGoBack();
    } else if (actionName === 'go-forward') {
      navigation.handleGoForward();
    } else {
      navigation.handleGoParent();
    }
    await Promise.resolve();
  });
}

function expectPreparedNavigationEffects(args: {
  action: ReturnType<typeof createNavigationActionMock>;
  actionName: 'go-back' | 'go-forward' | 'go-parent';
  callOrder: string[];
  expectedTargetNodeId: string;
  invoke: ReturnType<typeof createPrefetchInvokeMock>;
}) {
  expect(args.callOrder).toEqual([
    'selection-requested',
    'flush-draft',
    'save-view',
    args.actionName,
    'flush-draft-immediately',
    'load-started',
    'load-resolved',
    'load-merged'
  ]);
  expect(args.action).toHaveBeenCalledTimes(1);
  expect(args.invoke.mock.calls).toEqual([['load_node_document', { nodeId: args.expectedTargetNodeId }]]);
}

function buildParentNavigationNodes() {
  return {
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
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceNodeDocumentPrefetchForTest();
  resetWorkspaceNavigationTestState();
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
});

describe('useWorkspaceNavigation navigation hydration', () => {
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
    await expectPreparedNavigationResult({
      actionName: 'go-parent',
      actionResult: { focusAnchor: null, nodeId: 'node-1' },
      activeNodeId: 'child',
      expectedTargetNodeId: 'node-1',
      nodesById: buildParentNavigationNodes()
    });
  });
});

describe('useWorkspaceNavigation parent navigation refs', () => {
  it('keeps the shared editor ref bound during parent navigation', async () => {
    const { editorAdapter, editorRef, view } = createNavigationPrefetchHookHarness({
      actionName: 'go-parent',
      actionResult: { focusAnchor: null, nodeId: 'node-1' },
      activeNodeId: 'child',
      nodesById: buildParentNavigationNodes()
    });

    await act(async () => {
      view.result.current.handleGoParent();
      await Promise.resolve();
    });

    expect(editorRef.current).toBe(editorAdapter);
  });
});
