import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, VIRTUAL_SHELVED_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { createWorkspaceContentNode, renderWorkspaceContent } from './WorkspaceDualListContent.testUtils';

beforeEach(() => {
  useWorkspaceStore.setState({ updateVirtualNodeFilter: vi.fn() });
});

it('shows saved virtual results in the shared list column', () => {
  renderWorkspaceContent({
    activeNodeId: 'virtual-a',
    activeVirtualNodeId: 'virtual-a',
    isVirtualViewOpen: true,
    nodesById: {
      [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
      [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
      'virtual-a': createWorkspaceContentNode({
        id: 'virtual-a',
        kind: 'folder',
        parentNodeId: VIRTUAL_ROOT_NODE_ID,
        specialKind: 'virtual',
        title: 'Saved Search',
        virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'alpha' }], match: 'all', version: 1 }
      }),
      'topic-a': createWorkspaceContentNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic', content: 'alpha body' })
    },
    nodeOrder: [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'virtual-a', 'topic-a']
  });

  expect(screen.getByRole('complementary', { name: 'Topic list panel' })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 2, name: 'Topics' })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 2, name: 'Current folder topics' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open title search' })).toBeInTheDocument();
  expect(useWorkspaceStore.getState().updateVirtualNodeFilter).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Create topic' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Alpha Topic' })).toBeInTheDocument();
});

it('shows only result topics in the Shelved topic list column', () => {
  renderWorkspaceContent({
    activeNodeId: VIRTUAL_SHELVED_NODE_ID,
    activeVirtualNodeId: VIRTUAL_SHELVED_NODE_ID,
    isVirtualViewOpen: true,
    nodesById: {
      [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
      [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
      'shelved-topic': {
        ...createWorkspaceContentNode({ id: 'shelved-topic', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Shelved Topic' }),
        shelvedAt: '2026-05-01T00:00:00.000Z'
      }
    },
    nodeOrder: [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'shelved-topic']
  });

  expect(screen.getByRole('complementary', { name: 'Topic list panel' })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.queryByRole('searchbox', { name: 'Saved search query' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Shelved Topic' })).toBeInTheDocument();
});
