import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import {
  resetExternalCollapsedRowIds,
  saveExternalCollapsedRowIds
} from './externalLibraryCollapseSettings';
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
  window.localStorage.clear();
  resetExternalCollapsedRowIds();
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: ['item-a']
  }));
});

const externalFolders = [
  {
    attachmentMode: 'document_relative_first_then_fixed_root' as const,
    attachmentRootPath: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    documentCount: 2,
    excludedDirs: [],
    folderPath: '/library/two think',
    id: 'folder-ext',
    indexedAt: '2026-04-21T00:00:00.000Z',
    lastError: null,
    status: 'ready' as const,
    updatedAt: '2026-04-21T00:00:00.000Z'
  }
];

const externalEntriesByFolderId = {
  'folder-ext': [
    {
      absolutePath: '/library/two think/a.md',
      extension: 'md' as const,
      fileName: 'a.md',
      folderId: 'folder-ext',
      folderPath: '/library/two think',
      modifiedAt: '2026-04-21T00:00:00.000Z',
      relativePath: 'a.md'
    },
    {
      absolutePath: '/library/two think/sub/b.md',
      extension: 'md' as const,
      fileName: 'b.md',
      folderId: 'folder-ext',
      folderPath: '/library/two think',
      modifiedAt: '2026-04-21T00:00:00.000Z',
      relativePath: 'sub/b.md'
    }
  ]
};

const simpleNodesById = {
  [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
  'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' })
};

function renderExternalWorkspaceContent() {
  render(
    <WorkspaceDualListContent
      activeNodeId="folder-a"
      activeVirtualNodeId={null}
      externalEntriesByFolderId={externalEntriesByFolderId}
      externalFolders={externalFolders}
      externalSelection={{ folderId: 'folder-ext', kind: 'folder' }}
      isExternalViewOpen
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodesById={simpleNodesById}
      listNodesById={simpleNodesById}
      nodeOrder={[INBOX_NODE_ID, 'folder-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );
}

it('keeps the dual-column layout when opening trash search', () => {
  render(
    <WorkspaceDualListContent
      activeNodeId={null}
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
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
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId="item-a"
      trashedNodeIds={['item-a']}
    />
  );

  expect(screen.getAllByRole('complementary', { name: 'Node list panel' })).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search node titles' }), {
    target: { value: 'alpha' }
  });

  expect(screen.getByRole('searchbox', { name: 'Search node titles' })).toBeInTheDocument();
  expect(screen.getAllByRole('complementary', { name: 'Node list panel' })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Close title search' }));
  expect(screen.queryByRole('searchbox', { name: 'Search node titles' })).toBeNull();
  expect(screen.getAllByRole('complementary', { name: 'Node list panel' })).toHaveLength(2);
});

it('renders external folders in the left section and only documents in the right list', () => {
  renderExternalWorkspaceContent();

  expect(screen.queryByRole('separator', { name: 'Resize external section' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'External folders' })).toBeNull();
  expect(screen.getAllByRole('treeitem', { selected: true })).toHaveLength(1);
  expect(screen.getByRole('treeitem', { name: /two think/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: /two think/i })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('treeitem', { name: 'Folder A' })).toHaveAttribute('aria-selected', 'false');
  expect(screen.queryByRole('treeitem', { name: /^sub$/i })).toBeNull();
  expect(screen.getByRole('button', { name: /expand .*think \*/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /a\.md/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /b\.md/i })).toBeInTheDocument();
  expect(screen.queryByText('sub/b.md')).toBeNull();
});

it('shows an expand toggle for external folders before their entries finish loading', () => {
  render(
    <WorkspaceDualListContent
      activeNodeId="folder-a"
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={externalFolders}
      externalSelection={{ folderId: 'folder-ext', kind: 'folder' }}
      isExternalViewOpen
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodesById={simpleNodesById}
      listNodesById={simpleNodesById}
      nodeOrder={[INBOX_NODE_ID, 'folder-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('button', { name: /expand .*think \*/i })).toBeInTheDocument();
});

it('restores persisted external collapse state without affecting sibling roots', () => {
  saveExternalCollapsedRowIds([]);

  render(
    <WorkspaceDualListContent
      activeNodeId="folder-a"
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{
        'folder-ext': externalEntriesByFolderId['folder-ext'],
        'folder-ext-2': [
          {
            absolutePath: '/library/to sync/x.md',
            extension: 'md' as const,
            fileName: 'x.md',
            folderId: 'folder-ext-2',
            folderPath: '/library/to sync',
            modifiedAt: '2026-04-21T00:00:00.000Z',
            relativePath: 'sync/x.md'
          }
        ]
      }}
      externalFolders={[
        ...externalFolders,
        {
          ...externalFolders[0],
          documentCount: 1,
          folderPath: '/library/to sync',
          id: 'folder-ext-2'
        }
      ]}
      externalSelection={{ folderId: 'folder-ext', kind: 'folder' }}
      isExternalViewOpen
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodesById={simpleNodesById}
      listNodesById={simpleNodesById}
      nodeOrder={[INBOX_NODE_ID, 'folder-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('treeitem', { name: /^sub$/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: /^sync$/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^collapse two think \*$/i }));

  expect(screen.queryByRole('treeitem', { name: /^sub$/i })).toBeNull();
  expect(screen.getByRole('treeitem', { name: /^sync$/i })).toBeInTheDocument();
});
