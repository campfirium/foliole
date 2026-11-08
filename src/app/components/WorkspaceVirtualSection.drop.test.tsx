import { fireEvent, screen } from '@testing-library/react';
import type { DragEvent as ReactDragEvent } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createCollectionVirtualNodeFilter, createManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import { clearNodeListDragSource, writeNodeListDragSource } from '../../features/nodes/components/NodeListDragSource';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceVirtualSection } from './WorkspaceVirtualSection';

const now = '2026-07-19T00:00:00.000Z';

function fullNode(input: Partial<Node> & Pick<Node, 'id' | 'kind' | 'title'>): Node {
  return { content: '', createdAt: now, isTitleManual: true, parentNodeId: null, reveal: null, review: null, updatedAt: now, ...input };
}

function listNode(input: Pick<WorkspaceListNode, 'id' | 'parentNodeId' | 'specialKind' | 'title'>): WorkspaceListNode {
  return { createdAt: now, hasContent: false, hasReveal: false, kind: 'folder', review: null, updatedAt: now, ...input };
}

function dragData(topicId: string) {
  const dataTransfer = { dropEffect: 'move', effectAllowed: 'move', getData: vi.fn(() => ''), setData: vi.fn() };
  writeNodeListDragSource({ dataTransfer } as unknown as ReactDragEvent<HTMLElement>, [topicId]);
  return dataTransfer;
}

beforeEach(() => {
  clearNodeListDragSource();
  useWorkspaceStore.setState({
    nodeOrder: ['topic', VIRTUAL_ROOT_NODE_ID, 'manual', 'filtered'],
    nodesById: {
      topic: fullNode({ id: 'topic', kind: 'topic', parentNodeId: 'physical-folder', title: 'Topic' }),
      manual: fullNode({ id: 'manual', kind: 'folder', manualChildOrder: ['existing'], parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Manual', virtualFilter: createManualVirtualNodeFilter() }),
      filtered: fullNode({ id: 'filtered', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Filtered', virtualFilter: createCollectionVirtualNodeFilter('Filtered') })
    },
    moveNodes: vi.fn(async () => true),
    setFolderManualChildOrder: vi.fn(() => true),
    trashedNodeIds: []
  });
});

it('copies a dragged Topic into a manual virtual folder without moving its physical parent', () => {
  const root = listNode({ id: VIRTUAL_ROOT_NODE_ID, parentNodeId: null, specialKind: 'virtual-root', title: 'Virtual' });
  const manual = listNode({ id: 'manual', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Manual' });
  const filtered = listNode({ id: 'filtered', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Filtered' });
  renderWithLocalization(<WorkspaceVirtualSection activeVirtualNodeId={null} isVirtualViewOpen={false} nodeOrder={[root.id, manual.id, filtered.id]} nodesById={{ [root.id]: root, [manual.id]: manual, [filtered.id]: filtered }} onSelectNodeInVirtualView={vi.fn()} />);

  const manualRow = screen.getByRole('treeitem', { name: 'Manual' });
  const manualDrag = dragData('topic');
  fireEvent.dragEnter(manualRow, { dataTransfer: manualDrag });
  expect(manualRow.parentElement).toHaveClass('border-border-strong');
  fireEvent.dragOver(manualRow, { dataTransfer: manualDrag });
  expect(manualDrag.dropEffect).toBe('copy');
  fireEvent.drop(manualRow, { dataTransfer: manualDrag });
  expect(useWorkspaceStore.getState().setFolderManualChildOrder).toHaveBeenCalledWith('manual', ['existing', 'topic']);
  expect(useWorkspaceStore.getState().nodesById.topic?.parentNodeId).toBe('physical-folder');

  fireEvent.dragOver(screen.getByRole('treeitem', { name: 'Filtered' }), { dataTransfer: dragData('topic') });
  expect(useWorkspaceStore.getState().setFolderManualChildOrder).toHaveBeenCalledOnce();
});

it('moves virtual folders under another virtual folder and back to the Virtual root', () => {
  const root = listNode({ id: VIRTUAL_ROOT_NODE_ID, parentNodeId: null, specialKind: 'virtual-root', title: 'Virtual' });
  const manual = listNode({ id: 'manual', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Manual' });
  const filtered = listNode({ id: 'filtered', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Filtered' });
  renderWithLocalization(<WorkspaceVirtualSection activeVirtualNodeId={null} isVirtualViewOpen={false} nodeOrder={[root.id, manual.id, filtered.id]} nodesById={{ [root.id]: root, [manual.id]: manual, [filtered.id]: filtered }} onSelectNodeInVirtualView={vi.fn()} />);

  const nestedDrag = dragData('manual');
  fireEvent.dragEnter(screen.getByRole('treeitem', { name: 'Filtered' }), { dataTransfer: nestedDrag });
  expect(nestedDrag.dropEffect).toBe('move');
  fireEvent.drop(screen.getByRole('treeitem', { name: 'Filtered' }), { dataTransfer: nestedDrag });
  expect(useWorkspaceStore.getState().moveNodes).toHaveBeenCalledWith(['manual'], 'filtered', 'child');

  fireEvent.drop(screen.getByRole('treeitem', { name: 'Virtual' }), { dataTransfer: dragData('manual') });
  expect(useWorkspaceStore.getState().moveNodes).toHaveBeenLastCalledWith(['manual'], VIRTUAL_ROOT_NODE_ID, 'child');
});
