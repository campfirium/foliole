import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { resetExternalCollapsedRowIds } from './externalLibraryCollapseSettings';
import { WorkspaceDualListContent } from './WorkspaceDualListContent';

function createNode(id: string, title: string) {
  return {
    anchorLink: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    content: '',
    hasContent: false,
    hasReveal: false,
    id,
    kind: 'folder' as const,
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    specialKind: id === INBOX_NODE_ID ? ('inbox' as const) : undefined,
    title,
    updatedAt: '2026-04-20T00:00:00.000Z',
    virtualFilter: null
  };
}

const nodesById = {
  [INBOX_NODE_ID]: createNode(INBOX_NODE_ID, 'Inbox'),
  'folder-a': createNode('folder-a', 'Folder A')
};

beforeEach(() => {
  window.localStorage.clear();
  resetExternalCollapsedRowIds();
  useWorkspaceStore.setState((state) => ({ ...state, trashedNodeIds: [] }));
});

it('renders Readwise-managed external folders distinctly in the workspace node lists', () => {
  render(
    <WorkspaceDualListContent
      activeNodeId="folder-a"
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{
        'readwise-reader-import-articles': [
          {
            absolutePath: '/Readwise/Full Document Contents/Articles/plain.md',
            extension: 'md',
            fileName: 'plain.md',
            folderId: 'readwise-reader-import-articles',
            folderPath: '/Readwise/Full Document Contents/Articles',
            modifiedAt: '2026-04-21T00:00:00.000Z',
            openingText: 'Plain opening',
            relativePath: 'plain.md',
            title: 'Plain'
          }
        ]
      }}
      externalFolders={[
        {
          attachmentMode: 'document_relative_first_then_fixed_root',
          attachmentRootPath: null,
          createdAt: '2026-04-21T00:00:00.000Z',
          documentCount: 1,
          excludedDirs: [],
          folderPath: '/Readwise/Full Document Contents/Articles',
          id: 'readwise-reader-import-articles',
          indexedAt: '2026-04-21T00:00:00.000Z',
          lastError: null,
          status: 'ready',
          updatedAt: '2026-04-21T00:00:00.000Z'
        }
      ]}
      externalSelection={{ folderId: 'readwise-reader-import-articles', kind: 'folder' }}
      isExternalViewOpen={true}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      listNodesById={nodesById}
      nodesById={nodesById}
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

  expect(screen.getByRole('treeitem', { name: /^Readwise$/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: /Articles/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Plain' })).toBeInTheDocument();
});
