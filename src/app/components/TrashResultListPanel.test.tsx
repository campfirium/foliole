import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { TrashResultListPanel } from './TrashResultListPanel';

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
}): WorkspaceListNode {
  return {
    createdAt: '2026-05-01T00:00:00.000Z',
    hasContent: args.kind !== 'folder',
    hasReveal: args.kind === 'item',
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    review: null,
    title: args.title,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

function renderTrashPanel(args: {
  selectedTrashNodeId?: string | null;
  trashedNodeDeletedAtById?: Record<string, string | undefined>;
  trashedNodeIds: string[];
}) {
  const nodesById = {
    folder: createNode({ id: 'folder', kind: 'folder', title: 'Folder A' }),
    topic: createNode({ id: 'topic', kind: 'topic', parentNodeId: 'folder', title: 'Topic A' }),
    item: createNode({ id: 'item', kind: 'item', parentNodeId: 'topic', title: 'Needle item' }),
    solo: createNode({ id: 'solo', kind: 'item', title: 'Solo item' })
  };
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeDeletedAtById: args.trashedNodeDeletedAtById ?? {},
    trashedNodeIds: args.trashedNodeIds
  }));
  render(
    <TrashResultListPanel
      nodeOrder={['folder', 'topic', 'item', 'solo']}
      nodesById={nodesById}
      onSelectTrashNode={() => undefined}
      selectedTrashNodeId={args.selectedTrashNodeId ?? null}
      trashedNodeIds={args.trashedNodeIds}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

it('shows deleted roots without exposing covered descendants', () => {
  renderTrashPanel({ trashedNodeIds: ['folder', 'topic', 'item', 'solo'] });

  const trashTree = screen.getByRole('tree', { name: 'Trash topics' });
  expect(within(trashTree).getByRole('treeitem', { name: /Folder A/ })).toBeInTheDocument();
  expect(within(trashTree).queryByRole('treeitem', { name: /Topic A/ })).toBeNull();
  expect(within(trashTree).queryByRole('treeitem', { name: /Needle item/ })).toBeNull();
});

it('keeps standalone deleted descendants visible as trash roots', () => {
  renderTrashPanel({ trashedNodeIds: ['item'] });

  const trashTree = screen.getByRole('tree', { name: 'Trash topics' });
  expect(within(trashTree).getByRole('treeitem', { name: /Needle item/ })).toBeInTheDocument();
});

it('searches covered descendants while showing the matching trash root', () => {
  renderTrashPanel({ trashedNodeIds: ['folder', 'topic', 'item'] });

  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: 'needle' }
  });

  const trashTree = screen.getByRole('tree', { name: 'Trash topics' });
  expect(within(trashTree).getByRole('treeitem', { name: /Folder A/ })).toBeInTheDocument();
  expect(within(trashTree).queryByRole('treeitem', { name: /Needle item/ })).toBeNull();
});

it('defaults trash sorting to deleted time and orders roots by deletion time', () => {
  renderTrashPanel({
    trashedNodeDeletedAtById: {
      folder: '2026-05-01T00:00:00.000Z',
      solo: '2026-05-03T00:00:00.000Z'
    },
    trashedNodeIds: ['folder', 'topic', 'item', 'solo']
  });

  expect(screen.getByRole('button', { name: 'Sort list by Deleted time' })).toBeInTheDocument();
  const rows = screen.getAllByRole('treeitem');
  expect(rows[0]).toHaveTextContent('Solo item');
  expect(rows[1]).toHaveTextContent('Folder A');
});
