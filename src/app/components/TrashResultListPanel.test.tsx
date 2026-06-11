import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { TrashResultListPanel } from './TrashResultListPanel';
import { saveWorkspaceContentSortPreference, type WorkspaceContentSortState } from './workspaceContentSort';

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
  nodeOrder?: string[];
  nodesById?: Record<string, WorkspaceListNode>;
  onSelectNode?: (nodeId: string) => void;
  onSelectTrashNode?: (nodeId: string) => void;
  selectedTrashNodeId?: string | null;
  sort?: WorkspaceContentSortState;
  trashedNodeDeletedAtById?: Record<string, string | undefined>;
  trashedNodeIds: string[];
}) {
  if (args.sort) {
    saveWorkspaceContentSortPreference(args.sort);
  }
  const nodesById = args.nodesById ?? {
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
  renderWithLocalization(
    <TrashResultListPanel
      nodeOrder={args.nodeOrder ?? ['folder', 'topic', 'item', 'solo']}
      nodesById={nodesById}
      onSelectNode={args.onSelectNode ?? (() => undefined)}
      onSelectTrashNode={args.onSelectTrashNode ?? (() => undefined)}
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

it('renders trash sorting without unstable store snapshot updates', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  renderTrashPanel({ trashedNodeIds: ['folder', 'topic', 'item', 'solo'] });

  expect(screen.getByRole('button', { name: 'Sort list by Deleted time' })).toBeInTheDocument();
  expect(consoleError.mock.calls.join('\n')).not.toContain('getSnapshot should be cached');
  consoleError.mockRestore();
});

it('moves trash row selection with arrow keys', () => {
  const onSelectTrashNode = vi.fn();
  renderTrashPanel({
    onSelectTrashNode,
    selectedTrashNodeId: 'solo',
    trashedNodeDeletedAtById: {
      folder: '2026-05-01T00:00:00.000Z',
      solo: '2026-05-03T00:00:00.000Z'
    },
    trashedNodeIds: ['folder', 'topic', 'item', 'solo']
  });

  fireEvent.keyDown(screen.getByRole('treeitem', { name: /Solo item/ }), { key: 'ArrowDown' });

  expect(onSelectTrashNode).toHaveBeenCalledWith('folder');
});

it('selects shift ranges using the visible trash row order', () => {
  renderTrashPanel({
    nodeOrder: ['beta', 'zulu', 'alpha', 'delta'],
    nodesById: {
      alpha: createNode({ id: 'alpha', kind: 'item', title: 'Alpha topic' }),
      beta: createNode({ id: 'beta', kind: 'item', title: 'Beta topic' }),
      delta: createNode({ id: 'delta', kind: 'item', title: 'Delta topic' }),
      zulu: createNode({ id: 'zulu', kind: 'item', title: 'Zulu topic' })
    },
    sort: { direction: 'asc', key: 'name' },
    trashedNodeIds: ['alpha', 'beta', 'delta', 'zulu']
  });

  const trashTree = screen.getByRole('tree', { name: 'Trash topics' });
  const visibleRows = within(trashTree).getAllByRole('treeitem');
  expect(visibleRows.map((row) => row.textContent)).toEqual([
    expect.stringContaining('Alpha topic'),
    expect.stringContaining('Beta topic'),
    expect.stringContaining('Delta topic'),
    expect.stringContaining('Zulu topic')
  ]);

  fireEvent.click(within(trashTree).getByRole('treeitem', { name: /Alpha topic/ }));
  fireEvent.click(within(trashTree).getByRole('treeitem', { name: /Delta topic/ }), {
    shiftKey: true
  });

  expect(within(trashTree).getByRole('treeitem', { name: /Alpha topic/ })).toHaveAttribute('aria-selected', 'true');
  expect(within(trashTree).getByRole('treeitem', { name: /Beta topic/ })).toHaveAttribute('aria-selected', 'true');
  expect(within(trashTree).getByRole('treeitem', { name: /Delta topic/ })).toHaveAttribute('aria-selected', 'true');
  expect(within(trashTree).getByRole('treeitem', { name: /Zulu topic/ })).toHaveAttribute('aria-selected', 'false');
});

it('opens the restored topic from the trash row context menu', async () => {
  const onSelectNode = vi.fn();
  const restoreNode = vi.fn().mockResolvedValue('restored-topic');
  useWorkspaceStore.setState((state) => ({
    ...state,
    restoreNode
  }));
  renderTrashPanel({
    onSelectNode,
    selectedTrashNodeId: 'solo',
    trashedNodeIds: ['solo']
  });

  fireEvent.contextMenu(screen.getByRole('treeitem', { name: /Solo item/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));

  await waitFor(() => expect(restoreNode).toHaveBeenCalledWith('solo'));
  expect(onSelectNode).toHaveBeenCalledWith('restored-topic');
});

it('keeps the trash view active when restoring multiple selected trash rows', async () => {
  const onSelectNode = vi.fn();
  const restoreNode = vi.fn().mockResolvedValue('restored-topic');
  useWorkspaceStore.setState((state) => ({
    ...state,
    restoreNode
  }));
  renderTrashPanel({
    onSelectNode,
    trashedNodeIds: ['folder', 'solo']
  });

  fireEvent.click(screen.getByRole('treeitem', { name: /Folder A/ }));
  fireEvent.click(screen.getByRole('treeitem', { name: /Solo item/ }), { ctrlKey: true });
  fireEvent.contextMenu(screen.getByRole('treeitem', { name: /Solo item/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));

  await waitFor(() => expect(restoreNode).toHaveBeenCalledTimes(2));
  expect(restoreNode).toHaveBeenCalledWith('folder');
  expect(restoreNode).toHaveBeenCalledWith('solo');
  expect(onSelectNode).not.toHaveBeenCalled();
});
