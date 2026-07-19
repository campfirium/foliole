import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { openWorkspaceNodeWithPreparedDocument } from './workspaceNodePreparation';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  const initial = createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z'));
  const seedNode = Object.values(initial.nodesById)[0]!;
  const regularNode = { ...seedNode };
  delete regularNode.specialKind;
  delete regularNode.virtualFilter;
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    browseRootNodeId: 'folder-a',
    nodeOrder: ['folder-a', 'node-1', 'folder-b', 'node-2'],
    nodesById: {
      'folder-a': { ...regularNode, content: '', hasContent: false, id: 'folder-a', kind: 'folder', parentNodeId: null, title: 'Folder A' },
      'node-1': { ...regularNode, content: 'Node 1 body', hasContent: true, id: 'node-1', kind: 'topic', parentNodeId: 'folder-a', title: 'Node 1' },
      'folder-b': { ...regularNode, content: '', hasContent: false, id: 'folder-b', kind: 'folder', parentNodeId: null, title: 'Folder B' },
      'node-2': { ...regularNode, content: '', hasContent: true, id: 'node-2', kind: 'topic', parentNodeId: 'folder-b', title: 'Node 2' }
    },
    rendererBoundaryKeepNodeIds: ['folder-a', 'node-1', 'folder-b', 'node-2'],
    trashedNodeIds: []
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue({
    content: 'Loaded node 2 body', hideTitleHeading: false, kind: 'topic', reveal: null, virtualFilter: null
  }));
});

it('opens a prepared node with its physical folder context', async () => {
  await openWorkspaceNodeWithPreparedDocument('node-2');

  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: 'node-2', browseRootNodeId: 'folder-b' });
});
