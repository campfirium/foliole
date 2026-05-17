import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { vi } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { definedProps } from '../../shared/lib/definedProps';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';

export function createWorkspaceContentNode(args: {
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
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...definedProps({
      specialKind: args.specialKind,
      virtualFilter: args.virtualFilter
    })
  };
}

const simpleNodesById = {
  [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
  'folder-a': createWorkspaceContentNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' })
};

export function renderWorkspaceContent(
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
