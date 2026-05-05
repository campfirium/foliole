import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
  content?: string;
  specialKind?: 'inbox' | 'trash' | 'virtual-root' | 'virtual';
  virtualFilter?: {
    conditions: Array<{ field: 'text'; operator: 'contains'; value: string }>;
    match: 'all';
    version: 1;
  } | null;
}) {
  return {
    anchorLink: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    content: args.content ?? '',
    hasContent: args.kind !== 'folder',
    hasReveal: args.kind === 'item',
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    reveal: null,
    review: null,
    specialKind: args.specialKind,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z',
    virtualFilter: args.virtualFilter ?? null
  };
}

beforeEach(() => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: ['item-a']
  }));
});

it('keeps the dual-column layout when opening trash search', () => {
  render(
    <WorkspaceDualListContent
      activeNodeId={null}
      activeVirtualNodeId={null}
      isTrashViewOpen
      isVirtualViewOpen={false}
      nodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
        'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
        'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
        'item-a': createNode({ id: 'item-a', kind: 'item', parentNodeId: 'topic-a', title: 'Alpha Note' })
      }}
      listNodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
        'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
        'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
        'item-a': createNode({ id: 'item-a', kind: 'item', parentNodeId: 'topic-a', title: 'Alpha Note' })
      }}
      nodeOrder={[INBOX_NODE_ID, 'folder-a', 'topic-a', 'item-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId="item-a"
      trashedNodeIds={['item-a']}
    />
  );

  expect(screen.getAllByRole('complementary', { name: 'Node list panel' })).toHaveLength(3);

  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search node titles' }), {
    target: { value: 'alpha' }
  });

  expect(screen.getByRole('searchbox', { name: 'Search node titles' })).toBeInTheDocument();
  expect(screen.getAllByRole('complementary', { name: 'Node list panel' })).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Close title search' }));
  expect(screen.queryByRole('searchbox', { name: 'Search node titles' })).toBeNull();
  expect(screen.getAllByRole('complementary', { name: 'Node list panel' })).toHaveLength(3);
});
