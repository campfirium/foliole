import { render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { useWorkspaceDualListViewRoot } from './workspaceDualListViewRoot';

function createNode(id: string, kind: NonNullable<WorkspaceListNode['kind']>): WorkspaceListNode {
  return {
    createdAt: '2026-05-29T00:00:00.000Z',
    hasContent: kind !== 'folder',
    hasReveal: false,
    id,
    kind,
    parentNodeId: null,
    reading: null,
    review: null,
    title: id,
    updatedAt: '2026-05-29T00:00:00.000Z'
  };
}

function PreferredFolderProbe(props: {
  activeNodeId: string | null;
  browseRootNodeId: string;
  listNodesById: WorkspaceListNodesById;
  onCommit: (preferredFolderColumnId: string | null) => void;
}) {
  const { activeNodeId, browseRootNodeId, listNodesById, onCommit } = props;
  const viewRoot = useWorkspaceDualListViewRoot({
    activeNodeId,
    browseRootNodeId,
    isExternalViewOpen: false,
    isTrashViewOpen: false,
    isVirtualViewOpen: false,
    listNodesById,
    onSelectNode: vi.fn()
  });

  useLayoutEffect(() => {
    onCommit(viewRoot.preferredFolderColumnId);
  }, [onCommit, viewRoot.preferredFolderColumnId]);

  return null;
}

it('resolves the persisted browse root independently from the active topic', () => {
  const onCommit = vi.fn();
  const listNodesById = {
    'folder-a': createNode('folder-a', 'folder'),
    'topic-a': createNode('topic-a', 'topic')
  };

  render(
    <PreferredFolderProbe
      activeNodeId="topic-a"
      browseRootNodeId="folder-a"
      listNodesById={listNodesById}
      onCommit={onCommit}
    />
  );

  expect(onCommit).toHaveBeenNthCalledWith(1, 'folder-a');
});
