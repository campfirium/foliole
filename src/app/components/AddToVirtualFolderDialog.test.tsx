import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { AddToVirtualFolderDialog } from './AddToVirtualFolderDialog';

const now = '2026-07-19T00:00:00.000Z';

function node(input: Partial<Node> & Pick<Node, 'id' | 'kind' | 'title'>): Node {
  return {
    content: '', createdAt: now, isTitleManual: true, parentNodeId: null,
    reveal: null, review: null, updatedAt: now, ...input
  };
}

beforeEach(() => {
  const setFolderManualChildOrder = vi.fn(() => true);
  useWorkspaceStore.setState({
    nodeOrder: ['topic', 'existing', 'manual', 'filtered'],
    nodesById: {
      topic: node({ id: 'topic', kind: 'topic', title: 'Topic' }),
      existing: node({ id: 'existing', kind: 'topic', title: 'Existing' }),
      manual: node({
        id: 'manual', kind: 'folder', manualChildOrder: ['existing'],
        parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Manual',
        virtualFilter: createManualVirtualNodeFilter()
      }),
      filtered: node({
        id: 'filtered', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID,
        specialKind: 'virtual', title: 'Filtered',
        virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'query' }], match: 'all', version: 1 }
      })
    },
    setFolderManualChildOrder,
    trashedNodeIds: []
  });
});

it('searches eligible manual virtual folders in the shared floating palette style', () => {
  const onClose = vi.fn();
  renderWithLocalization(<AddToVirtualFolderDialog onClose={onClose} topicIds={['topic']} />);

  expect(screen.getByRole('dialog', { name: 'Add to Virtual Folder' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Filtered' })).toBeNull();
  const input = screen.getByRole('textbox', { name: 'Add to virtual folder' });
  fireEvent.change(input, { target: { value: 'missing' } });
  expect(screen.getByText('No matching virtual folders')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'man' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(useWorkspaceStore.getState().setFolderManualChildOrder)
    .toHaveBeenCalledWith('manual', ['existing', 'topic']);
  expect(onClose).toHaveBeenCalledOnce();
});

it('offers to create a manual virtual folder when none are available', () => {
  const createVirtualNode = vi.fn(async () => 'virtual-new');
  useWorkspaceStore.setState({
    createVirtualNode,
    nodeOrder: ['topic'],
    nodesById: { topic: node({ id: 'topic', kind: 'topic', title: 'Topic' }) }
  });

  renderWithLocalization(<AddToVirtualFolderDialog onClose={vi.fn()} topicIds={['topic']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create Virtual Folder' }));

  expect(createVirtualNode).toHaveBeenCalledWith({ mode: 'manual' });
});
