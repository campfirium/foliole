import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
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

function renderVirtualContentColumn() {
  const onSelectNode = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();

  render(
    <WorkspaceDualListContent
      activeNodeId="virtual-a"
      activeVirtualNodeId="virtual-a"
      isTrashViewOpen={false}
      isVirtualViewOpen
      nodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
        [VIRTUAL_ROOT_NODE_ID]: createNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
        'virtual-a': {
          ...createNode({ id: 'virtual-a', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search' }),
          virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'alpha' }], match: 'all', version: 1 }
        },
        'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic', content: 'alpha body' })
      }}
      listNodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
        [VIRTUAL_ROOT_NODE_ID]: createNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
        'virtual-a': createNode({ id: 'virtual-a', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search' }),
        'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic' })
      }}
      nodeOrder={[INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'virtual-a', 'topic-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={onSelectNode}
      onSelectNodeInVirtualView={onSelectNodeInVirtualView}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  return { onSelectNode, onSelectNodeInVirtualView };
}

function renderVirtualRootAggregate() {
  const onSelectNode = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();

  render(
    <WorkspaceDualListContent
      activeNodeId={VIRTUAL_ROOT_NODE_ID}
      activeVirtualNodeId={VIRTUAL_ROOT_NODE_ID}
      isTrashViewOpen={false}
      isVirtualViewOpen
      nodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
        [VIRTUAL_ROOT_NODE_ID]: createNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
        'virtual-a': {
          ...createNode({ id: 'virtual-a', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search A' }),
          virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'alpha' }], match: 'all', version: 1 }
        },
        'virtual-b': {
          ...createNode({ id: 'virtual-b', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search B' }),
          virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'beta' }], match: 'all', version: 1 }
        },
        'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic', content: 'alpha body' }),
        'topic-b': createNode({ id: 'topic-b', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Beta Topic', content: 'beta body' })
      }}
      listNodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
        [VIRTUAL_ROOT_NODE_ID]: createNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
        'virtual-a': createNode({ id: 'virtual-a', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search A' }),
        'virtual-b': createNode({ id: 'virtual-b', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search B' }),
        'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic' }),
        'topic-b': createNode({ id: 'topic-b', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Beta Topic' })
      }}
      nodeOrder={[INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'virtual-a', 'virtual-b', 'topic-a', 'topic-b']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={onSelectNode}
      onSelectNodeInVirtualView={onSelectNodeInVirtualView}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  return { onSelectNode, onSelectNodeInVirtualView };
}

beforeEach(() => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));
});

it('routes an active virtual node into the right content column', () => {
  const { onSelectNodeInVirtualView } = renderVirtualContentColumn();

  expect(screen.getAllByRole('complementary', { name: 'Node list panel' })).toHaveLength(2);
  expect(screen.getByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.getAllByRole('treeitem', { selected: true })).toHaveLength(1);
  expect(screen.getByRole('treeitem', { name: 'Saved Search' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('treeitem', { name: 'Alpha Topic Inbox' })).toBeInTheDocument();
  expect(screen.getAllByText('Inbox').length).toBeGreaterThan(0);
  expect(screen.getAllByRole('complementary', { name: 'Node list panel' })[1].querySelector('.app-scrollbar')).toHaveClass('pt-5', 'pb-2');

  fireEvent.click(screen.getByRole('treeitem', { name: 'Alpha Topic Inbox' }));
  expect(onSelectNodeInVirtualView).toHaveBeenCalledWith('topic-a');
});

it('shows aggregate result items for the Virtual root even when list nodes are trimmed', () => {
  renderVirtualRootAggregate();

  expect(screen.getByRole('treeitem', { name: 'Alpha Topic Inbox' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Beta Topic Inbox' })).toBeInTheDocument();
  expect(screen.queryByText('No virtual folders yet')).toBeNull();
});

it('opens virtual view when selecting a virtual folder from the lower section while it is inactive', () => {
  const onOpenVirtualView = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();

  render(
    <WorkspaceDualListContent
      activeNodeId="topic-a"
      activeVirtualNodeId={null}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
        [VIRTUAL_ROOT_NODE_ID]: createNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
        'virtual-a': createNode({ id: 'virtual-a', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search' }),
        'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic', content: 'alpha body' })
      }}
      listNodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
        [VIRTUAL_ROOT_NODE_ID]: createNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
        'virtual-a': createNode({ id: 'virtual-a', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search' }),
        'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic' })
      }}
      nodeOrder={[INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'virtual-a', 'topic-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={onOpenVirtualView}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={onSelectNodeInVirtualView}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  fireEvent.click(screen.getByRole('treeitem', { name: 'Saved Search' }));

  expect(onOpenVirtualView).toHaveBeenCalledWith('virtual-a');
  expect(onSelectNodeInVirtualView).toHaveBeenCalledWith('virtual-a');
});
