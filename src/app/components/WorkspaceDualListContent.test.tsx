import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import * as externalLibraryRuntime from '../../shared/platform/externalLibraryBrowseRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useExternalLibraryView } from '../hooks/useExternalLibraryView';

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

afterEach(() => vi.restoreAllMocks());

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

it('renders external folders in the left section and only documents in the right list', () => {
  renderWorkspaceContent({
    activeNodeId: 'folder-a',
    externalEntriesByFolderId: externalEntriesByFolderId,
    externalFolders,
    externalSelection: { folderId: 'folder-ext', kind: 'folder' },
    isExternalViewOpen: true
  });

  expect(screen.queryByRole('separator', { name: 'Resize External' })).toBeNull();
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

const readwiseFolderIds = ['readwise-reader-import-books', 'readwise-reader-import-articles'];
const aggregateFolders = [
  ...externalFolders,
  ...readwiseFolderIds.map((id) => ({ ...externalFolders[0]!, id, folderPath: `/Readwise/${id}`, documentCount: 1 }))
];
const aggregateEntries: Record<string, externalLibraryRuntime.ExternalLibraryBrowseEntry[]> = {
  ...externalEntriesByFolderId,
  ...Object.fromEntries(readwiseFolderIds.map((id, index) => [id, [{
    ...externalEntriesByFolderId['folder-ext'][0]!,
    absolutePath: `/Readwise/${id}/read.md`, folderId: id, title: index === 0 ? 'Readwise book' : 'Readwise article'
  }]]))
};
const inbox = { [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }) };

function ExternalWorkspace() {
  const external = useExternalLibraryView();
  return <WorkspaceDualListContent activeNodeId={null} externalEntriesByFolderId={external.entriesByFolderId}
    externalFolders={external.folders} externalSelection={external.selection} isExternalViewOpen={external.isExternalViewOpen}
    isStudyMode={false} isTrashViewOpen={false} isVirtualViewOpen={false} nodesById={inbox} listNodesById={inbox}
    nodeOrder={[INBOX_NODE_ID]} onOpenExternalSelection={external.openExternalSelection} onOpenMoveToNode={vi.fn()} onOpenNotesView={vi.fn()}
    onOpenTrashView={vi.fn()} onSelectNode={vi.fn()} onSelectNodeInVirtualView={vi.fn()} onSelectTrashNode={vi.fn()}
    reviewCurrentNodeId={null} selectedTrashNodeId={null} trashedNodeIds={[]} />;
}

it('loads reference documents and lets Readwise browse independently of other folders', async () => {
  let finishRegularLoad!: (entries: typeof externalEntriesByFolderId['folder-ext']) => void;
  const regularEntries = new Promise<typeof externalEntriesByFolderId['folder-ext']>((resolve) => {
    finishRegularLoad = resolve;
  });
  vi.spyOn(externalLibraryRuntime, 'loadExternalLibraryFolders').mockResolvedValue(aggregateFolders);
  vi.spyOn(externalLibraryRuntime, 'loadExternalLibraryBrowseEntries').mockImplementation(async (id) =>
    id === 'folder-ext' ? regularEntries : aggregateEntries[id] ?? []
  );
  renderWithLocalization(<ExternalWorkspace />);
  const readwise = await screen.findByRole('treeitem', { name: 'Readwise' });
  const heading = screen.getByRole('treeitem', { name: 'External' });

  fireEvent.click(heading);
  expect(heading).toHaveAttribute('aria-selected', 'true');
  expect(heading).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('status', { busy: true })).toBeVisible();

  fireEvent.click(readwise);
  expect(readwise).toHaveAttribute('aria-selected', 'true');
  expect(heading).toHaveAttribute('aria-selected', 'false');
  const group = within(await screen.findByRole('tree', { name: 'External folder contents' }));
  expect(group.getAllByRole('treeitem')).toHaveLength(2);
  expect(group.getByRole('treeitem', { name: 'Readwise book' })).toBeVisible();
  expect(group.getByRole('treeitem', { name: 'Readwise article' })).toBeVisible();

  fireEvent.click(heading);
  expect(screen.getByRole('status', { busy: true })).toBeVisible();
  await act(async () => finishRegularLoad(externalEntriesByFolderId['folder-ext']));
  const documents = within(screen.getByRole('tree', { name: 'External folder contents' }));
  fireEvent.keyDown(screen.getByRole('button', { name: /Sort list by / }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Name' }));
  expect(documents.getAllByRole('treeitem').map((row) => row.textContent)).toEqual([
    'Alpha', 'Beta', 'Readwise article', 'Readwise book'
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'article' } });
  expect(documents.getAllByRole('treeitem')).toHaveLength(1);
  expect(documents.getByRole('treeitem', { name: 'Readwise article' })).toBeVisible();
});
