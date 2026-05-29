import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, VIRTUAL_SHELVED_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { createWorkspaceContentNode, renderWorkspaceContent } from './WorkspaceDualListContent.testUtils';

beforeEach(() => {
  useWorkspaceStore.setState({ updateVirtualNodeFilter: vi.fn() });
});

it('shows a persisted query field for user saved searches', () => {
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

  expect(screen.getByRole('searchbox', { name: 'Saved search query' })).toHaveValue('alpha');
  expect(screen.queryByRole('button', { name: 'Open title search' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Alpha Topic Inbox' })).toBeInTheDocument();
});

it('shows a fixed explanation instead of a query field for Shelved', () => {
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

  expect(screen.getByText('Shelved topics stay here until you return them to active reading.')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox', { name: 'Saved search query' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Shelved Topic Inbox' })).toBeInTheDocument();
});
