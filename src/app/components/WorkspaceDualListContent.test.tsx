import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
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
      openingText: 'Alpha opening',
      relativePath: 'a.md',
      title: 'Alpha'
    },
    {
      absolutePath: '/library/two think/sub/b.md',
      extension: 'md' as const,
      fileName: 'b.md',
      folderId: 'folder-ext',
      folderPath: '/library/two think',
      modifiedAt: '2026-04-21T00:00:00.000Z',
      openingText: 'Beta opening',
      relativePath: 'sub/b.md',
      title: 'Beta'
    }
  ]
};

const simpleNodesById = {
  [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
  'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' })
};

function createExternalEntry(args: {
  absolutePath: string;
  fileName: string;
  folderId: string;
  folderPath: string;
  openingText: string;
  relativePath: string;
  title: string;
}) {
  return { ...args, extension: 'md' as const, modifiedAt: '2026-04-21T00:00:00.000Z' };
}

function renderWorkspaceContent(
  overrides: Partial<ComponentProps<typeof WorkspaceDualListContent>> = {}
) {
  render(
    <WorkspaceDualListContent
      activeNodeId={null}
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
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
      {...overrides}
    />
  );
}

it('keeps the dual-column layout when opening trash search', () => {
  const trashNodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
    'item-a': createNode({ id: 'item-a', kind: 'item', parentNodeId: 'topic-a', title: 'Alpha Note' })
  };

  renderWorkspaceContent({
    isTrashViewOpen: true,
    listNodesById: trashNodesById,
    nodeOrder: [INBOX_NODE_ID, 'folder-a', 'topic-a', 'item-a'],
    nodesById: trashNodesById,
    selectedTrashNodeId: 'item-a',
    trashedNodeIds: ['item-a']
  });

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
  renderWorkspaceContent({
    activeNodeId: 'folder-a',
    externalEntriesByFolderId: externalEntriesByFolderId,
    externalFolders,
    externalSelection: { folderId: 'folder-ext', kind: 'folder' },
    isExternalViewOpen: true
  });

  expect(screen.queryByRole('separator', { name: 'Resize external section' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'External folders' })).toBeNull();
  expect(screen.getAllByRole('treeitem', { selected: true })).toHaveLength(1);
  expect(screen.getByRole('treeitem', { name: /two think/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: /two think/i })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('treeitem', { name: 'Folder A' })).toHaveAttribute('aria-selected', 'false');
  expect(screen.queryByRole('treeitem', { name: /^sub$/i })).toBeNull();
  expect(screen.getByRole('button', { name: /expand .*think \*/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Alpha' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Beta' })).toBeInTheDocument();
  expect(screen.queryByText('sub/b.md')).toBeNull();
  expect(screen.queryByText('Alpha opening')).toBeNull();
  expect(screen.queryByText('Beta opening')).toBeNull();
  expect(screen.queryByText('2026-04-21')).toBeNull();
});

it('shows an expand toggle for external folders before their entries finish loading', () => {
  renderWorkspaceContent({
    activeNodeId: 'folder-a',
    externalFolders,
    externalSelection: { folderId: 'folder-ext', kind: 'folder' },
    isExternalViewOpen: true
  });

  expect(screen.getByRole('button', { name: /expand .*think \*/i })).toBeInTheDocument();
});

it('opens external library settings from the External placeholder row when no folders are configured', () => {
  const onOpenExternalLibrarySettings = vi.fn();

  renderWorkspaceContent({
    isExternalViewOpen: true,
    onOpenExternalLibrarySettings
  });

  const setupRow = screen.getByRole('treeitem', { name: 'External' });
  expect(setupRow).toHaveAttribute('aria-selected', 'true');

  fireEvent.click(setupRow);

  expect(onOpenExternalLibrarySettings).toHaveBeenCalledTimes(1);
});

it('restores persisted external collapse state without affecting sibling roots', () => {
  saveExternalCollapsedRowIds([]);

  renderWorkspaceContent({
    activeNodeId: 'folder-a',
    externalEntriesByFolderId: {
      'folder-ext': externalEntriesByFolderId['folder-ext'],
      'folder-ext-2': [
        createExternalEntry({
          absolutePath: '/library/to sync/x.md',
          fileName: 'x.md',
          folderId: 'folder-ext-2',
          folderPath: '/library/to sync',
          openingText: 'Sync opening',
          relativePath: 'sync/x.md',
          title: 'Sync note'
        })
      ]
    },
    externalFolders: [...externalFolders, { ...externalFolders[0], documentCount: 1, folderPath: '/library/to sync', id: 'folder-ext-2' }],
    externalSelection: { folderId: 'folder-ext', kind: 'folder' },
    isExternalViewOpen: true
  });

  expect(screen.getByRole('treeitem', { name: /^sub$/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: /^sync$/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^collapse two think \*$/i }));

  expect(screen.queryByRole('treeitem', { name: /^sub$/i })).toBeNull();
  expect(screen.getByRole('treeitem', { name: /^sync$/i })).toBeInTheDocument();
});
