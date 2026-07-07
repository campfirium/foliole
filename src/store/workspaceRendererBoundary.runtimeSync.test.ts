import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { resolvePendingNodeSync, stagePendingNodeSync } from './workspacePendingNodeSync';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')));
}

function createLoadedNode(nodeId: string, title: string, content: string, reveal: string | null) {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;
  return {
    ...seedNode,
    id: nodeId,
    title,
    content,
    hasContent: content.trim().length > 0,
    reveal,
    hasReveal: reveal !== null
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(getRuntimeInvoke).mockReset();
  resetWorkspaceStore();
});

it('keeps inactive local edits when runtime mutation has not confirmed them', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(null));

  useWorkspaceStore.setState({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    rendererBoundaryKeepNodeIds: ['node-1'],
    nodesById: {
      'node-1': createLoadedNode('node-1', 'Node 1', '', null),
      'node-2': createLoadedNode('node-2', 'Node 2', 'Active node body', 'Active node answer')
    },
    trashedNodeIds: []
  });

  useWorkspaceStore.getState().updateNodeContent('node-1', 'Locally edited body');

  expect(useWorkspaceStore.getState().nodesById['node-1']!).toMatchObject({
    content: 'Locally edited body',
    hasContent: true,
    reveal: null,
    hasReveal: false
  });

  await Promise.resolve();
  await Promise.resolve();

  expect(useWorkspaceStore.getState().nodesById['node-1']!).toMatchObject({
    content: 'Locally edited body',
    hasContent: true,
    reveal: null,
    hasReveal: false
  });
  expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
    content: 'Active node body',
    hasContent: true,
    reveal: 'Active node answer',
    hasReveal: true
  });
});

it('keeps recently created annotation documents after runtime confirmation resolves pending sync', () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(null));
  const createdAt = '2026-03-20T00:00:00.000Z';
  const updatedAt = '2026-03-20T00:00:01.000Z';

  useWorkspaceStore.setState({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': createLoadedNode('node-1', 'Existing child', '', null),
      'node-2': createLoadedNode('node-2', 'Parent', 'Parent body', null)
    },
    trashedNodeIds: []
  });
  useWorkspaceStore.setState({
    nodeOrder: ['node-1', 'node-2'],
    rendererBoundaryKeepNodeIds: ['node-1'],
    nodesById: {
      ...useWorkspaceStore.getState().nodesById,
      'node-1': {
        ...createLoadedNode('node-1', 'Selected excerpt', 'Selected excerpt', null),
        anchorLink: { id: 'hl-1', kind: 'highlight' }
      }
    }
  });
  stagePendingNodeSync({
    anchorLink: { id: 'hl-1', kind: 'highlight' },
    content: 'Selected excerpt',
    createdAt,
    hideTitleHeading: false,
    isTitleManual: false,
    kind: 'topic',
    nodeId: 'node-1',
    parentNodeId: 'node-2',
    position: 0,
    reveal: null,
    title: 'Selected excerpt',
    updatedAt
  });

  resolvePendingNodeSync('node-1', updatedAt);

  expect(useWorkspaceStore.getState().nodesById['node-1']!).toMatchObject({
    content: 'Selected excerpt',
    hasContent: true,
    reveal: null
  });
});
