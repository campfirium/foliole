import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import {
  resetExternalCollapsedRowIds,
  saveExternalCollapsedRowIds
} from './externalLibraryCollapseSettings';
import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { createWorkspaceContentNode, renderWorkspaceContent } from './WorkspaceDualListContent.testUtils';

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

function HomePinnedWorkspaceHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(HOME_NODE_ID);
  const nodesById = {
    [HOME_NODE_ID]: createWorkspaceContentNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
    [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    'folder-a': createWorkspaceContentNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'folder-child': createWorkspaceContentNode({ id: 'folder-child', kind: 'folder', parentNodeId: 'folder-a', title: 'Child Folder' }),
    'topic-a': createWorkspaceContentNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-child', title: 'Topic A' })
  };

  return (
    <WorkspaceDualListContent
      activeNodeId={activeNodeId}
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
      isStudyMode={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodesById={nodesById}
      listNodesById={nodesById}
      nodeOrder={[HOME_NODE_ID, INBOX_NODE_ID, 'folder-a', 'folder-child', 'topic-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={setActiveNodeId}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );
}

it('keeps the dual-column layout when opening trash search', () => {
  const trashNodesById = {
    [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-a': createWorkspaceContentNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'topic-a': createWorkspaceContentNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
    'item-a': createWorkspaceContentNode({ id: 'item-a', kind: 'item', parentNodeId: 'topic-a', title: 'Alpha Note' })
  };

  renderWorkspaceContent({
    isTrashViewOpen: true,
    listNodesById: trashNodesById,
    nodeOrder: [INBOX_NODE_ID, 'folder-a', 'topic-a', 'item-a'],
    nodesById: trashNodesById,
    selectedTrashNodeId: 'item-a',
    trashedNodeIds: ['item-a']
  });

  expect(screen.getAllByRole('complementary', { name: 'Topic list panel' })).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: 'alpha' }
  });

  expect(screen.getByRole('searchbox', { name: 'Search topic titles' })).toBeInTheDocument();
  expect(screen.getAllByRole('complementary', { name: 'Topic list panel' })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Close title search' }));
  expect(screen.queryByRole('searchbox', { name: 'Search topic titles' })).toBeNull();
  expect(screen.getAllByRole('complementary', { name: 'Topic list panel' })).toHaveLength(2);
});

it('keeps Home selected and reveals the source folder when opening a Home topic', () => {
  renderWithLocalization(<HomePinnedWorkspaceHarness />);

  const folderColumn = screen.getAllByRole('tree', { name: 'Topic list' })[0]!;
  expect(within(folderColumn).getByRole('treeitem', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  expect(within(folderColumn).queryByRole('treeitem', { name: 'Child Folder' })).toBeNull();

  const contentColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.click(within(contentColumn).getByRole('treeitem', { name: 'Topic A' }));

  expect(within(folderColumn).getByRole('treeitem', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  expect(within(folderColumn).getByRole('treeitem', { name: 'Folder A' })).toHaveAttribute('aria-expanded', 'true');
  expect(within(folderColumn).getByRole('treeitem', { name: 'Child Folder' })).toHaveAttribute('data-node-location-highlight', 'true');
  expect(within(contentColumn).getByRole('treeitem', { name: 'Topic A' })).toHaveAttribute('aria-current', 'page');
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
  expect(screen.getByRole('treeitem', { name: /two think/i })).toHaveAttribute('aria-expanded', 'false');
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

  expect(screen.getByRole('treeitem', { name: /two think/i })).toHaveAttribute('aria-expanded', 'false');
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

it('ignores old external expansion memory and expands only the selected root', () => {
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
    externalFolders: [...externalFolders, { ...externalFolders[0]!, documentCount: 1, folderPath: '/library/to sync', id: 'folder-ext-2' }],
    externalSelection: { folderId: 'folder-ext', kind: 'folder' },
    isExternalViewOpen: true
  });

  expect(screen.queryByRole('treeitem', { name: /^sub$/i })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: /^sync$/i })).toBeNull();

  const externalFolderRow = screen.getByRole('treeitem', { name: /two think/i });
  expect(externalFolderRow).toHaveAttribute('aria-expanded', 'false');

  fireEvent.keyDown(externalFolderRow, { key: 'ArrowRight' });

  expect(screen.getByRole('treeitem', { name: /^sub$/i })).toBeInTheDocument();
  expect(screen.queryByRole('treeitem', { name: /^sync$/i })).toBeNull();
});
