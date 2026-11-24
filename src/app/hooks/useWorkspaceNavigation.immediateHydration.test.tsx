import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { removeCachedWorkspaceNodeDocument } from '../../store/workspaceNodeDocumentCache';
import { resetWorkspaceNodeDocumentLoaderForTest } from '../../store/workspaceNodeDocumentLoader';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import {
  createPrefetchInvokeMock,
  navigationTestNodes,
  resetWorkspaceNavigationTestState,
  seedPrefetchTestState,
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

function createPrefetchHookHarness(callOrder: string[]) {
  const openNode = vi.fn((nodeId: string) => {
    callOrder.push('open-node');
    useWorkspaceStore.getState().setActiveNode(nodeId);
    return { focusAnchor: null, nodeId };
  });
  const saveActiveNodeView = vi.fn(() => {
    callOrder.push('save-view');
  });
  const flushPendingEditorDraft = vi.fn(() => {
    callOrder.push('flush-draft');
  });

  const view = renderHook(() =>
    useWorkspaceNavigation({
      activeNodeContent: 'Alpha body',
      activeNodeId: 'node-1',
      activeNodeParentId: null,
      backStackSize: 0,
      beginAnchorNavigationRestore: vi.fn(),
      closeContextMenu: vi.fn(),
      completeAnchorNavigationRestore: vi.fn(),
      editorRef: { current: null },
      flushPendingEditorDraft,
      flushPendingEditorDraftImmediately: vi.fn().mockResolvedValue(true),
      forwardStackSize: 0,
      goBack: vi.fn(() => null),
      goForward: vi.fn(() => null),
      goToParent: vi.fn(() => null),
      jumpToAncestorNode: vi.fn(() => null),
      nodesById: navigationTestNodes,
      openNode,
      saveActiveNodeView
    })
  );

  return { openNode, view };
}

function createPendingBodyInvoke(capture: (resolve: (value: unknown) => void) => void) {
  return vi.fn((...[command]: [string, unknown?]) => (
    command === 'load_node_document' ? new Promise((resolve) => capture(resolve)) : Promise.resolve(undefined)
  ));
}

async function runImmediateHydrationCase() {
  seedPrefetchTestState();
  const invoke = createPrefetchInvokeMock();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  const callOrder = trackPrefetchCallOrder({
    markNodeDocumentMerged,
    markNodeDocumentLoadResolved,
    markNodeDocumentLoadStarted,
    markNodeSelectionRequested
  });
  const { openNode, view } = createPrefetchHookHarness(callOrder);

  await act(async () => {
    await view.result.current.handleSelectNode('node-2');
  });

  expect(callOrder).toEqual([
    'selection-requested',
    'flush-draft',
    'load-started',
    'load-resolved',
    'load-merged',
    'flush-draft',
    'save-view',
    'open-node'
  ]);
  expect(openNode).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls.filter(([command]) => command === 'load_node_document'))
    .toEqual([['load_node_document', { nodeId: 'node-2' }]]);
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
    content: 'Loaded node 2 body',
    hasContent: true
  });
}

describe('useWorkspaceNavigation immediate hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceNavigationTestState();
    resetWorkspaceNodeDocumentLoaderForTest();
    for (const nodeId of ['node-1', 'node-2', 'pdf-parent']) removeCachedWorkspaceNodeDocument(nodeId);
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });

  it('keeps the current note until a cold target body is ready, then switches', runImmediateHydrationCase);

  it('switches only to the newest cold target when clicks overlap', async () => {
    seedPrefetchTestState();
    useWorkspaceStore.setState((state) => ({
      nodeOrder: [...state.nodeOrder, 'pdf-parent'],
      nodesById: { ...state.nodesById, 'pdf-parent': { ...state.nodesById['pdf-parent']!, hasContent: true, hasReveal: false } }
    }));
    const resolvers: Array<(value: unknown) => void> = [];
    vi.mocked(getRuntimeInvoke).mockReturnValue(
      vi.fn(() => new Promise((resolve) => { resolvers.push(resolve); }))
    );
    const { openNode, view } = createPrefetchHookHarness([]);
    const body = { content: 'Body', hideTitleHeading: false, kind: 'topic', reveal: null, virtualFilter: null };

    await act(async () => {
      const first = view.result.current.handleSelectNode('node-2');
      const second = view.result.current.handleSelectNode('pdf-parent');
      resolvers.forEach((resolve) => resolve(body));
      await Promise.all([first, second]);
    });

    expect(openNode).toHaveBeenCalledTimes(1);
    expect(openNode).toHaveBeenCalledWith('pdf-parent', 'current-context');
    expect(useWorkspaceStore.getState().activeNodeId).toBe('pdf-parent');
  });

  it('does not switch while the body is still loading', async () => {
    seedPrefetchTestState();
    let resolveBody: (value: unknown) => void = () => undefined;
    vi.mocked(getRuntimeInvoke).mockReturnValue(
      vi.fn(() => new Promise((resolve) => { resolveBody = resolve; }))
    );
    const { openNode, view } = createPrefetchHookHarness([]);

    let pending: unknown;
    await act(async () => {
      pending = view.result.current.handleSelectNode('node-2');
      await Promise.resolve();
    });
    expect(openNode).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');

    await act(async () => {
      resolveBody({ content: 'Body', hideTitleHeading: false, kind: 'topic', reveal: null, virtualFilter: null });
      await pending;
    });
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  });
});

describe('useWorkspaceNavigation cold open interleaving', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceNavigationTestState();
    resetWorkspaceNodeDocumentLoaderForTest();
    for (const nodeId of ['node-1', 'node-2', 'pdf-parent']) removeCachedWorkspaceNodeDocument(nodeId);
  });

  it('does not pull the view back when another entry navigates away during the read', async () => {
    seedPrefetchTestState();
    useWorkspaceStore.setState((state) => ({
      nodeOrder: [...state.nodeOrder, 'pdf-parent'],
      nodesById: { ...state.nodesById, 'pdf-parent': { ...state.nodesById['pdf-parent']!, content: 'Hot body', hasContent: true, hasReveal: false } }
    }));
    let resolveBody: (value: unknown) => void = () => undefined;
    vi.mocked(getRuntimeInvoke).mockReturnValue(createPendingBodyInvoke((resolve) => { resolveBody = resolve; }));
    const { openNode, view } = createPrefetchHookHarness([]);

    let cold: unknown;
    await act(async () => {
      cold = view.result.current.handleSelectNode('node-2');
      await Promise.resolve();
    });
    await act(async () => {
      await view.result.current.handleSelectNode('pdf-parent');
    });
    await act(async () => {
      resolveBody({ content: 'Body', hideTitleHeading: false, kind: 'topic', reveal: null, virtualFilter: null });
      await cold;
    });

    expect(openNode.mock.calls.map(([nodeId]) => nodeId)).toEqual(['pdf-parent']);
    expect(useWorkspaceStore.getState().activeNodeId).toBe('pdf-parent');
  });

  it('drops the pending cold open when the current note is selected again', async () => {
    seedPrefetchTestState();
    let resolveBody: (value: unknown) => void = () => undefined;
    vi.mocked(getRuntimeInvoke).mockReturnValue(createPendingBodyInvoke((resolve) => { resolveBody = resolve; }));
    const { openNode, view } = createPrefetchHookHarness([]);

    let cold: unknown;
    await act(async () => {
      cold = view.result.current.handleSelectNode('node-2');
      await Promise.resolve();
    });
    await act(async () => {
      await view.result.current.handleSelectNode('node-1');
    });
    await act(async () => {
      resolveBody({ content: 'Body', hideTitleHeading: false, kind: 'topic', reveal: null, virtualFilter: null });
      await cold;
    });

    expect(openNode.mock.calls.map(([nodeId]) => nodeId)).toEqual(['node-1']);
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
  });
});
