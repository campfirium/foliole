import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { FolderListView } from './FolderListView';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  const { id, title, ...rest } = overrides;
  return {
    content: '',
    createdAt: '2026-04-01T09:00:00.000Z',
    id,
    kind: overrides.kind ?? 'topic',
    openingText: null,
    parentNodeId: overrides.parentNodeId === undefined ? 'folder-1' : overrides.parentNodeId,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-04-02T10:30:00.000Z',
    ...rest
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

function getRenderedEntryTitles() {
  return within(screen.getByRole('list', { name: 'Folder contents' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')?.replace(/^Open\s+/, '') ?? '');
}

function ManualFolderListHarness() {
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  return (
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={nodeOrder}
      nodeViewById={{}}
      nodesById={nodesById}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={vi.fn<(nodeId: string) => void>()}
      sortDirection="asc"
      sortKey="manual"
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  const folder = createNode({
    id: 'folder-1',
    kind: 'folder',
    manualChildOrder: ['node-b', 'node-a'],
    parentNodeId: null,
    title: 'Library root'
  });
  const alpha = createNode({ id: 'node-a', title: 'Alpha' });
  const beta = createNode({ id: 'node-b', title: 'Beta' });
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeOrder: ['folder-1', 'node-a', 'node-b'],
    nodesById: {
      ...state.nodesById,
      [folder.id]: folder,
      [alpha.id]: alpha,
      [beta.id]: beta
    }
  }));
});

it('reorders manual folder contents when the visible row button is dragged', () => {
  renderWithLocalization(<ManualFolderListHarness />);
  const transfer = createDragTransfer();

  expect(getRenderedEntryTitles()).toEqual(['Beta', 'Alpha']);

  fireEvent.dragStart(screen.getByRole('button', { name: 'Open Alpha' }), { dataTransfer: transfer });
  fireEvent.dragOver(screen.getByRole('button', { name: 'Open Beta' }), { dataTransfer: transfer });
  fireEvent.drop(screen.getByRole('button', { name: 'Open Beta' }), { dataTransfer: transfer });

  expect(getRenderedEntryTitles()).toEqual(['Alpha', 'Beta']);
  expect(useWorkspaceStore.getState().nodesById['folder-1']?.manualChildOrder).toEqual(['node-a', 'node-b']);
});
