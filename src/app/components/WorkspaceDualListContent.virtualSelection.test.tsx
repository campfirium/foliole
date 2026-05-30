import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';

import { createWorkspaceContentNode, renderWorkspaceContent } from './WorkspaceDualListContent.testUtils';

it('opens virtual view when selecting a virtual folder from the lower section while it is inactive', () => {
  const onOpenVirtualView = vi.fn();
  const onSelectNodeInVirtualView = vi.fn();
  const nodesById = {
    [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
    'virtual-a': createWorkspaceContentNode({ id: 'virtual-a', kind: 'folder', parentNodeId: VIRTUAL_ROOT_NODE_ID, specialKind: 'virtual', title: 'Saved Search' }),
    'topic-a': createWorkspaceContentNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic', content: 'alpha body' })
  };

  renderWorkspaceContent({
    activeNodeId: 'topic-a',
    activeVirtualNodeId: null,
    isVirtualViewOpen: false,
    nodesById,
    listNodesById: nodesById,
    nodeOrder: [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'virtual-a', 'topic-a'],
    onOpenVirtualView,
    onSelectNodeInVirtualView
  });

  fireEvent.click(screen.getByRole('treeitem', { name: 'Saved Search' }));

  expect(onOpenVirtualView).toHaveBeenCalledWith('virtual-a');
  expect(onSelectNodeInVirtualView).toHaveBeenCalledWith('virtual-a');
});
