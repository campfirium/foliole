import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, VIRTUAL_SHELVED_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
  content?: string;
  specialKind?: 'inbox' | 'trash' | 'virtual-root' | 'virtual';
  shelvedAt?: string | null;
  anchorLink?: Node['anchorLink'];
  virtualFilter?: {
    conditions: Array<{ field: 'text'; operator: 'contains'; value: string }>;
    match: 'all';
    version: 1;
  } | null;
}): Node & WorkspaceListNode {
  const kind = args.kind ?? (args.parentNodeId ? 'topic' : 'folder');
  return {
    anchorLink: args.anchorLink ?? null,
    createdAt: '2026-04-20T00:00:00.000Z',
    content: args.content ?? '',
    hasContent: kind !== 'folder',
    hasReveal: kind === 'item',
    id: args.id,
    kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    reveal: null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...definedProps({
      shelvedAt: args.shelvedAt,
      specialKind: args.specialKind,
      virtualFilter: args.virtualFilter
    })
  };
}

function renderVirtualContentColumn() {
  const onSelectNodeInVirtualView = vi.fn();

  render(
    <WorkspaceDualListContent
      activeNodeId="virtual-a"
      activeVirtualNodeId="virtual-a"
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
      isStudyMode={false}
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
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={onSelectNodeInVirtualView}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  return { onSelectNodeInVirtualView };
}

function renderVirtualRootAggregate() {
  render(
    <WorkspaceDualListContent
      activeNodeId={VIRTUAL_ROOT_NODE_ID}
      activeVirtualNodeId={VIRTUAL_ROOT_NODE_ID}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
      isStudyMode={false}
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
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

}

beforeEach(() => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));
});

it('routes an active virtual node into the right content column', () => {
  const { onSelectNodeInVirtualView } = renderVirtualContentColumn();

  expect(screen.getAllByRole('complementary', { name: 'Topic list panel' })).toHaveLength(1);
  expect(screen.getByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Saved Search' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('treeitem', { name: 'Alpha Topic' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('treeitem', { name: 'Alpha Topic' }));
  expect(onSelectNodeInVirtualView).toHaveBeenCalledWith('topic-a');
});

it('lists only directly shelved ordinary topics in the Shelved virtual view', () => {
  render(
    <WorkspaceDualListContent
      activeNodeId={VIRTUAL_SHELVED_NODE_ID}
      activeVirtualNodeId={VIRTUAL_SHELVED_NODE_ID}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
      isStudyMode={false}
      isTrashViewOpen={false}
      isVirtualViewOpen
      nodesById={{
        [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
        [VIRTUAL_ROOT_NODE_ID]: createNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
        'shelved-topic': createNode({ id: 'shelved-topic', kind: 'topic', parentNodeId: INBOX_NODE_ID, shelvedAt: '2026-05-01T00:00:00.000Z', title: 'Shelved Topic' }),
        'shelved-anchor': createNode({
          id: 'shelved-anchor',
          kind: 'topic',
          parentNodeId: 'shelved-topic',
          shelvedAt: '2026-05-01T00:00:00.000Z',
          title: 'Shelved Anchor',
          anchorLink: { id: 'a', kind: 'highlight' }
        }),
        'active-topic': createNode({ id: 'active-topic', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Active Topic' }),
        'trashed-topic': createNode({ id: 'trashed-topic', kind: 'topic', parentNodeId: INBOX_NODE_ID, shelvedAt: '2026-05-01T00:00:00.000Z', title: 'Trashed Topic' })
      }}
      listNodesById={{}}
      nodeOrder={[INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'shelved-topic', 'shelved-anchor', 'active-topic', 'trashed-topic']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={['trashed-topic']}
    />
  );

  expect(screen.getByRole('treeitem', { name: 'Shelved Topic' })).toBeInTheDocument();
  expect(screen.queryByText('Shelved Anchor')).toBeNull();
  expect(screen.queryByText('Active Topic')).toBeNull();
  expect(screen.queryByText('Trashed Topic')).toBeNull();
});

it('collapses virtual descendants without removing the virtual section itself', () => {
  renderVirtualRootAggregate();

  expect(screen.getByRole('treeitem', { name: 'Saved Search A' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Saved Search B' })).toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Virtual' }), { key: 'ArrowLeft' });

  expect(screen.queryByRole('treeitem', { name: 'Saved Search A' })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: 'Saved Search B' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Virtual' })).toBeInTheDocument();
});
