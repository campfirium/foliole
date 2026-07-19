import { createEvent, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { VirtualResultListPanel } from './VirtualResultListPanel';

vi.mock('../../store/workspaceRuntimeSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/workspaceRuntimeSync')>()),
  syncNodeContentToRuntime: vi.fn()
}));

function createNode(id: string, title: string): Node {
  return {
    content: 'Body',
    createdAt: '2026-05-01T00:00:00.000Z',
    id,
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

function transfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: 'move', effectAllowed: 'move',
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => data.set(format, value)
  };
}

function rowFrame(name: string) {
  const frame = screen.getByRole('treeitem', { name }).parentElement;
  if (!frame) throw new Error('Expected virtual Topic row frame.');
  frame.getBoundingClientRect = () => ({
    bottom: 100, height: 100, left: 0, right: 240, top: 0, width: 240, x: 0, y: 0,
    toJSON: () => undefined
  });
  return frame;
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-05-01T00:00:00.000Z')));
});

it('removes Topics from a manual virtual folder without offering physical Move to', () => {
  const first = createNode('first', 'First result');
  const second = createNode('second', 'Second result');
  const folder: Node = {
    ...createNode('virtual-manual', 'Manual'),
    content: '',
    kind: 'folder',
    manualChildOrder: ['first', 'second'],
    parentNodeId: 'special-virtual-root',
    specialKind: 'virtual',
    virtualFilter: createManualVirtualNodeFilter()
  };
  const nodesById = { first, second, 'virtual-manual': folder };
  useWorkspaceStore.setState({ nodeOrder: ['virtual-manual', 'first', 'second'], nodesById });

  renderWithLocalization(
    <VirtualResultListPanel
      activeNodeId={null}
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'user-search', nodeId: 'virtual-manual', query: '', title: 'Manual' }}
      nodeOrder={['virtual-manual', 'first', 'second']}
      nodes={[first, second]}
      nodesById={nodesById}
      onSelectNode={vi.fn()}
      preserveItemOrder
    />
  );

  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'First result' }));
  expect(screen.getByRole('menuitem', { name: 'Remove from This Virtual Folder' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Move to…' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Create Topic' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Paste as Topic' })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from This Virtual Folder' }));
  expect(useWorkspaceStore.getState().nodesById['virtual-manual']?.manualChildOrder).toEqual(['second']);
  expect(useWorkspaceStore.getState().nodesById.first).toBeDefined();
});

it('does not offer manual removal in a filtered virtual folder', () => {
  const first = createNode('first', 'First result');
  renderWithLocalization(
    <VirtualResultListPanel
      activeNodeId={null}
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'user-search', nodeId: 'virtual-filter', query: 'first', title: 'Filtered' }}
      nodeOrder={['first']}
      nodes={[first]}
      nodesById={{ first }}
      onSelectNode={vi.fn()}
    />
  );

  fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'First result' }));
  expect(screen.queryByRole('menuitem', { name: 'Remove from This Virtual Folder' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Move to…' })).toBeNull();
});

it('reorders manual virtual folder members without moving their physical parents', async () => {
  const first = { ...createNode('first', 'First result'), parentNodeId: 'physical-a' };
  const second = { ...createNode('second', 'Second result'), parentNodeId: 'physical-b' };
  const folder: Node = {
    ...createNode('virtual-manual', 'Manual'), content: '', kind: 'folder',
    manualChildOrder: ['first', 'second'], parentNodeId: 'special-virtual-root',
    specialKind: 'virtual', virtualFilter: createManualVirtualNodeFilter()
  };
  const nodesById = { first, second, 'virtual-manual': folder };
  useWorkspaceStore.setState({ nodeOrder: ['virtual-manual', 'first', 'second'], nodesById });
  renderWithLocalization(
    <VirtualResultListPanel
      activeNodeId={null} emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'user-search', nodeId: 'virtual-manual', query: '', title: 'Manual' }}
      nodeOrder={['first', 'second']} nodes={[first, second]} nodesById={nodesById}
      onSelectNode={vi.fn()} preserveItemOrder
    />
  );
  const dataTransfer = transfer();
  const firstFrame = rowFrame('First result');
  const secondFrame = rowFrame('Second result');
  fireEvent.dragStart(firstFrame, { dataTransfer });
  const dragOver = createEvent.dragOver(secondFrame, { dataTransfer, clientY: 90 });
  Object.defineProperty(dragOver, 'clientY', { value: 90 });
  fireEvent(secondFrame, dragOver);
  const drop = createEvent.drop(secondFrame, { dataTransfer, clientY: 90 });
  Object.defineProperty(drop, 'clientY', { value: 90 });
  fireEvent(secondFrame, drop);

  await waitFor(() => expect(useWorkspaceStore.getState().nodesById['virtual-manual']?.manualChildOrder)
    .toEqual(['second', 'first']));
  expect(useWorkspaceStore.getState().nodesById.first?.parentNodeId).toBe('physical-a');
  expect(useWorkspaceStore.getState().nodesById.second?.parentNodeId).toBe('physical-b');
});
