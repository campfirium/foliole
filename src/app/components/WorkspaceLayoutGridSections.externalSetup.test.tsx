import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';

vi.mock('./WorkspaceDocumentSurface', () => ({
  WorkspaceDocumentSurface: () => null
}));

import { WorkspaceListArea } from './WorkspaceLayoutGridSections';

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
}) {
  return {
    anchorLink: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    content: '',
    hasContent: args.kind !== 'folder',
    hasReveal: args.kind === 'item',
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    reveal: null,
    review: null,
    specialKind: args.id === INBOX_NODE_ID ? 'inbox' : undefined,
    title: args.title,
    updatedAt: '2026-04-21T00:00:00.000Z',
    virtualFilter: null
  };
}

it('opens external library settings from the empty External row in the real list area', () => {
  const onOpenExternalLibrarySettings = vi.fn();
  const nodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Projects' })
  };

  render(
    <WorkspaceListArea
      activeNodeId="folder-a"
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      isWorkspaceHydrated
      listNodesById={nodesById}
      nodesById={nodesById}
      nodeOrder={[INBOX_NODE_ID, 'folder-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      onOpenExternalLibrarySettings={onOpenExternalLibrarySettings}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  fireEvent.click(screen.getByRole('treeitem', { name: 'External' }));

  expect(onOpenExternalLibrarySettings).toHaveBeenCalledTimes(1);
});
