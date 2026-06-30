import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import {
  requestWorkspaceNodeDocumentPreload,
  resetWorkspaceNodeDocumentPrefetchForTest,
  setVisibleWorkspaceNodeDocumentPrefetchIds
} from './workspaceNodeDocumentPrefetch';
import {
  ensureWorkspaceNodeDocumentReady,
  openWorkspaceNodeWithPreparedDocument
} from './workspaceNodePreparation';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function seedTrimmedNodeState() {
  const initial = createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z'));
  const seedNode = initial.nodesById['node-1']!;
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': {
        ...seedNode,
        id: 'node-1',
        title: 'Node 1',
        content: 'Loaded node 1 body',
        hasContent: true,
        reveal: null,
        hasReveal: false
      },
      'node-2': {
        ...seedNode,
        id: 'node-2',
        title: 'Node 2',
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: false
      }
    },
    trashedNodeIds: []
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  resetWorkspaceNodeDocumentPrefetchForTest();
  seedTrimmedNodeState();
});

function createDeferredDocument() {
  let resolve: (value: {
    content: string;
    hideTitleHeading: boolean;
    kind: 'topic';
    reveal: null;
    virtualFilter: null;
  }) => void;
  const promise = new Promise<{
    content: string;
    hideTitleHeading: boolean;
    kind: 'topic';
    reveal: null;
    virtualFilter: null;
  }>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve: resolve! };
}

it('loads and merges a trimmed document before programmatic open', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content: 'Loaded node 2 body',
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null,
    virtualFilter: null
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await openWorkspaceNodeWithPreparedDocument('node-2');

  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-2' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
    content: 'Loaded node 2 body',
    hasContent: true
  });
});

it('opens an already loaded node without invoking the runtime again', async () => {
  const invoke = vi.fn();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await openWorkspaceNodeWithPreparedDocument('node-1');

  expect(invoke).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
  expect(useWorkspaceStore.getState().nodesById['node-1']!).toMatchObject({
    content: 'Loaded node 1 body',
    hasContent: true
  });
});

it('reuses a preloaded document without invoking the runtime again', async () => {
  const invoke = vi.fn();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await ensureWorkspaceNodeDocumentReady('node-2', {
    keepWarm: true,
    preloadedDocument: {
      content: 'Preloaded node 2 body',
      hideTitleHeading: false,
      kind: 'topic',
      reveal: null,
      virtualFilter: null
    }
  });

  expect(invoke).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
    content: 'Preloaded node 2 body',
    hasContent: true
  });
});

it('skips applying a prepared open when a newer navigation request supersedes it', async () => {
  const deferred = createDeferredDocument();
  const invoke = vi.fn().mockReturnValue(deferred.promise);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const pendingOpen = openWorkspaceNodeWithPreparedDocument('node-2', {
    shouldApply: () => false
  });

  deferred.resolve({
    content: 'Loaded node 2 body',
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null,
    virtualFilter: null
  });

  await expect(pendingOpen).resolves.toBeNull();
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
  expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
    content: '',
    hasContent: true
  });
});

it('reopens a trimmed node from the renderer cache without invoking the runtime again', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content: 'Loaded node 2 body',
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null,
    virtualFilter: null
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await ensureWorkspaceNodeDocumentReady('node-2');
  useWorkspaceStore.setState((state) => ({
    nodesById: {
      ...state.nodesById,
      'node-2': {
        ...state.nodesById['node-2']!,
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: false
      }
    }
  }));

  await openWorkspaceNodeWithPreparedDocument('node-2');

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
    content: 'Loaded node 2 body',
    hasContent: true
  });
});

it('preloads recent history, active neighbors, and visible rows without merging them into the store', async () => {
  const invoke = vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command !== 'load_node_document' || !payload?.nodeId) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      content: `Loaded ${payload.nodeId} body`,
      hideTitleHeading: false,
      kind: 'topic',
      reveal: null,
      virtualFilter: null
    });
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'],
    navigation: {
      backStack: ['node-1'],
      forwardStack: []
    },
    nodesById: {
      ...state.nodesById,
      'node-1': { ...state.nodesById['node-1']!, id: 'node-1', title: 'Node 1', parentNodeId: null, content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-2': { ...state.nodesById['node-1']!, id: 'node-2', title: 'Node 2', parentNodeId: null, content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-3': { ...state.nodesById['node-1']!, id: 'node-3', title: 'Node 3', parentNodeId: null, content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-4': { ...state.nodesById['node-1']!, id: 'node-4', title: 'Node 4', parentNodeId: 'node-2', content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-5': { ...state.nodesById['node-1']!, id: 'node-5', title: 'Node 5', parentNodeId: null, content: '', hasContent: true, reveal: null, hasReveal: false }
    }
  }));
  setVisibleWorkspaceNodeDocumentPrefetchIds(['node-5']);

  requestWorkspaceNodeDocumentPreload();
  await vi.waitFor(() => {
    const userNodeLoads = invoke.mock.calls
      .map(([, payload]) => payload?.nodeId)
      .filter((nodeId) => nodeId?.startsWith('node-'));
    expect(userNodeLoads).toEqual(['node-1', 'node-3', 'node-5', 'node-4']);
  });
  expect(useWorkspaceStore.getState().nodesById['node-3']!).toMatchObject({ content: '' });
  expect(useWorkspaceStore.getState().nodesById['node-4']!).toMatchObject({ content: '' });
  expect(useWorkspaceStore.getState().nodesById['node-5']!).toMatchObject({ content: '' });
});

it('skips caching oversized documents and falls back to the runtime on reopen', async () => {
  const oversizedContent = 'x'.repeat(210 * 1024);
  const invoke = vi.fn().mockResolvedValue({
    content: oversizedContent,
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null,
    virtualFilter: null
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await ensureWorkspaceNodeDocumentReady('node-2');
  useWorkspaceStore.setState((state) => ({
    nodesById: {
      ...state.nodesById,
      'node-2': {
        ...state.nodesById['node-2']!,
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: false
      }
    }
  }));

  await openWorkspaceNodeWithPreparedDocument('node-2');

  expect(invoke).toHaveBeenCalledTimes(2);
});
