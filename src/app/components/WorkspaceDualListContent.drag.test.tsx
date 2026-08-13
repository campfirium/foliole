import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { resetNodeListCollapseSessionForTest } from '../../features/nodes/components/nodeListCollapseSession';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { definedProps } from '../../shared/lib/definedProps';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';

vi.mock('../../store/workspaceRuntimeSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/workspaceRuntimeSync')>()),
  syncMoveNodesToRuntime: vi.fn(async (payload) => ({ movedNodeIds: payload.nodes.map((node: { nodeId: string }) => node.nodeId),
    nodeOrder: payload.nodeOrder }))
}));

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
  specialKind?: 'inbox';
}) {
  return {
    anchorLink: null,
    content: args.kind === 'folder' ? '' : 'Body',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: args.kind !== 'folder',
    hasReveal: false,
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    reveal: null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...definedProps({ specialKind: args.specialKind })
  };
}

function createDragTransfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: 'move',
    effectAllowed: 'move',
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => data.set(format, value)
  };
}

function renderWorkspaceContent(
  overrides: Partial<ComponentProps<typeof WorkspaceDualListContent>> = {}
) {
  const nodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
    'folder-b': createNode({ id: 'folder-b', kind: 'folder', title: 'Folder B' }),
    'folder-b-child': createNode({ id: 'folder-b-child', kind: 'folder', parentNodeId: 'folder-b', title: 'Folder B child' })
  };
  const nodeOrder = [INBOX_NODE_ID, 'folder-a', 'topic-a', 'folder-b', 'folder-b-child'];

  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'topic-a',
    nodeOrder,
    nodesById,
    trashedNodeDeletedAtById: {},
    trashedNodeIds: []
  }));

  renderWithLocalization(
    <WorkspaceDualListContent
      activeNodeId="topic-a"
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
      isStudyMode={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      listNodesById={nodesById}
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onOpenExternalSelection={vi.fn()}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
      {...overrides}
    />
  );
}

function mockMiddleDropZone(row: HTMLElement) {
  const frame = row.parentElement;
  if (!frame) {
    throw new Error('Expected tree row frame.');
  }
  frame.getBoundingClientRect = () => ({
    bottom: 100,
    height: 100,
    left: 0,
    right: 240,
    toJSON: () => undefined,
    top: 0,
    width: 240,
    x: 0,
    y: 0
  });
}

function FolderClickHarness() {
  const [activeNodeId, setActiveNodeId] = useState('topic-a');
  const nodesById = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'folder-a-child': createNode({ id: 'folder-a-child', kind: 'folder', parentNodeId: 'folder-a', title: 'Folder A child' }),
    'topic-a': createNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-a', title: 'Topic A' }),
    'folder-b': createNode({ id: 'folder-b', kind: 'folder', title: 'Folder B' }),
    'folder-b-child': createNode({ id: 'folder-b-child', kind: 'folder', parentNodeId: 'folder-b', title: 'Folder B child' })
  };
  const nodeOrder = [INBOX_NODE_ID, 'folder-a', 'folder-a-child', 'topic-a', 'folder-b', 'folder-b-child'];

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
      listNodesById={nodesById}
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onOpenExternalSelection={vi.fn()}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
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

beforeEach(() => {
  window.localStorage.clear();
  resetNodeListCollapseSessionForTest();
});

it('moves a current-folder topic when dropped onto a directory folder', async () => {
  renderWorkspaceContent();
  const transfer = createDragTransfer();
  const topicRow = screen.getByRole('treeitem', { name: 'Topic A' });
  const targetFolderRow = screen.getByRole('treeitem', { name: 'Folder B' });
  mockMiddleDropZone(targetFolderRow);

  fireEvent.dragStart(topicRow, { dataTransfer: transfer });
  fireEvent.dragOver(targetFolderRow, { clientY: 50, dataTransfer: transfer });
  await waitFor(() => {
    expect(targetFolderRow.parentElement).toHaveClass('border');
  });
  fireEvent.drop(targetFolderRow, { clientY: 50, dataTransfer: transfer });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['topic-a']?.parentNodeId).toBe('folder-b');
  });
});

it('drops current-folder topics into directory folders even near row edges', async () => {
  renderWorkspaceContent();
  const transfer = createDragTransfer();
  const topicRow = screen.getByRole('treeitem', { name: 'Topic A' });
  const targetFolderRow = screen.getByRole('treeitem', { name: 'Folder B' });
  mockMiddleDropZone(targetFolderRow);

  fireEvent.dragStart(topicRow, { dataTransfer: transfer });
  fireEvent.dragOver(targetFolderRow, { clientY: 0, dataTransfer: transfer });
  await waitFor(() => {
    expect(targetFolderRow.parentElement).toHaveClass('border');
  });
  fireEvent.drop(targetFolderRow, { clientY: 0, dataTransfer: transfer });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['topic-a']?.parentNodeId).toBe('folder-b');
  });
});

it('does not offer the directory root as a drop target for current-folder topics', () => {
  renderWorkspaceContent();
  const transfer = createDragTransfer();
  const topicRow = screen.getByRole('treeitem', { name: 'Topic A' });
  const folderTree = screen.getAllByRole('tree', { name: 'Topic list' })[0];

  if (!folderTree) {
    throw new Error('Expected folder tree.');
  }
  fireEvent.dragStart(topicRow, { dataTransfer: transfer });
  fireEvent.dragOver(folderTree, { dataTransfer: transfer });

  expect(screen.queryByText('Drop to move topic to root')).not.toBeInTheDocument();
});

it('expands a collapsed directory folder while dragging a topic over it', async () => {
  renderWorkspaceContent();
  const transfer = createDragTransfer();
  const topicRow = screen.getByRole('treeitem', { name: 'Topic A' });
  const targetFolderRow = screen.getByRole('treeitem', { name: 'Folder B' });
  mockMiddleDropZone(targetFolderRow);

  expect(screen.queryByRole('treeitem', { name: 'Folder B child' })).not.toBeInTheDocument();

  fireEvent.dragStart(topicRow, { dataTransfer: transfer });
  fireEvent.dragOver(targetFolderRow, { clientY: 50, dataTransfer: transfer });

  await waitFor(() => {
    expect(screen.getByRole('treeitem', { name: 'Folder B child' })).toBeInTheDocument();
  });
});

it('keeps sibling folder branches open when another folder is clicked', () => {
  renderWithLocalization(<FolderClickHarness />);

  fireEvent.click(screen.getByRole('treeitem', { name: 'Folder A' }));
  expect(screen.getByRole('treeitem', { name: 'Folder A child' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('treeitem', { name: 'Folder B' }));

  expect(screen.getByRole('treeitem', { name: 'Folder A child' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Folder B child' })).toBeInTheDocument();
});
