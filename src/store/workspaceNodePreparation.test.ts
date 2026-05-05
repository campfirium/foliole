import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/bridge';

import { ensureWorkspaceNodeDocumentReady, openWorkspaceNodeWithPreparedDocument } from './workspaceNodePreparation';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function seedTrimmedNodeState() {
  const initial = createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z'));
  const seedNode = initial.nodesById['node-1'];
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
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
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
  expect(useWorkspaceStore.getState().nodesById['node-1']).toMatchObject({
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
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
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
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
    content: '',
    hasContent: true
  });
});
