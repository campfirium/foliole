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
