import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { resetWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

const runtimeInvoke = vi.fn();

function node(id: string, parentNodeId: string | null, kind: 'folder' | 'topic' = 'topic') {
  return {
    anchorLink: null,
    content: 'Body',
    createdAt: '2026-08-21T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind,
    parentNodeId,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-08-21T00:00:00.000Z'
  };
}

function seedWorkspace() {
  const initial = createInitialWorkspaceState(new Date('2026-08-21T00:00:00.000Z'));
  const nodes = [
    node('folder-a', null, 'folder'),
    node('folder-b', null, 'folder'),
    node('epub-book-root', 'folder-a'),
    node('node-epub-0123456789abcdef01234567', 'epub-book-root'),
    node('user-topic-under-book', 'epub-book-root')
  ];
  useWorkspaceStore.setState({
    ...initial,
    nodeOrder: [
      HOME_NODE_ID,
      INBOX_NODE_ID,
      VIRTUAL_ROOT_NODE_ID,
      ...nodes.map((entry) => entry.id)
    ],
    nodesById: {
      ...initial.nodesById,
      ...Object.fromEntries(nodes.map((entry) => [entry.id, entry]))
    }
  });
}

beforeEach(() => {
  resetWorkspaceMutationRepository();
  localStorage.clear();
  runtimeInvoke.mockReset();
  runtimeInvoke.mockImplementation(async (command, args?: unknown) => {
    if (command !== 'move_nodes') return null;
    const payload = args as { nodeOrder: string[]; nodes: Array<{ nodeId: string }> };
    return { movedNodeIds: payload.nodes.map((entry) => entry.nodeId), nodeOrder: payload.nodeOrder };
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(runtimeInvoke);
  seedWorkspace();
});

afterEach(() => {
  resetWorkspaceMutationRepository();
});

it('rejects generated EPUB structure before runtime mutation', async () => {
  await expect(useWorkspaceStore.getState().moveNodes(
    ['node-epub-0123456789abcdef01234567'],
    'folder-b',
    'child'
  )).resolves.toBe(false);

  expect(useWorkspaceStore.getState().nodesById['node-epub-0123456789abcdef01234567']?.parentNodeId)
    .toBe('epub-book-root');
  expect(runtimeInvoke).not.toHaveBeenCalled();
});

it.each(['epub-book-root', 'user-topic-under-book'])(
  'keeps user-organized node %s movable',
  async (sourceId) => {
    await expect(useWorkspaceStore.getState().moveNodes([sourceId], 'folder-b', 'child')).resolves.toBe(true);
    expect(useWorkspaceStore.getState().nodesById[sourceId]?.parentNodeId).toBe('folder-b');
  }
);
