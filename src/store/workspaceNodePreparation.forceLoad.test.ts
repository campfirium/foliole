import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { resetWorkspaceNodeDocumentPrefetchForTest } from './workspaceNodeDocumentPrefetch';
import {
  ensureWorkspaceNodeDocumentReady,
  openWorkspaceNodeWithPreparedDocument
} from './workspaceNodePreparation';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function seedLoadedActiveNode() {
  const initial = createInitialWorkspaceState(new Date('2026-05-22T00:00:00.000Z'));
  const seedNode = initial.nodesById['node-1']!;
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        ...seedNode,
        bodyStatus: 'ready',
        content: 'Old loaded body',
        hasContent: true,
        hasReveal: false,
        id: 'node-1',
        reveal: null,
        title: 'Node 1'
      }
    },
    trashedNodeIds: []
  });
}

function freshDocument(content: string) {
  return {
    content,
    hideTitleHeading: false,
    kind: 'topic' as const,
    reveal: null,
    virtualFilter: null
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  resetWorkspaceNodeDocumentPrefetchForTest();
  seedLoadedActiveNode();
});

it('force-load open replaces an already loaded active document', async () => {
  const invoke = vi.fn().mockResolvedValue(freshDocument('Fresh reimported body'));
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await openWorkspaceNodeWithPreparedDocument('node-1', { forceLoad: true });

  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-1' });
  expect(useWorkspaceStore.getState().nodesById['node-1']!).toMatchObject({
    content: 'Fresh reimported body',
    hasContent: true
  });
  expect(useWorkspaceStore.getState().navigation.backStack).toEqual([]);
});

it('force-load readiness replaces an already loaded kept document', async () => {
  const invoke = vi.fn().mockResolvedValue(freshDocument('Fresh prepared body'));
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await ensureWorkspaceNodeDocumentReady('node-1', { forceLoad: true });

  expect(useWorkspaceStore.getState().nodesById['node-1']!).toMatchObject({
    content: 'Fresh prepared body',
    hasContent: true
  });
});
