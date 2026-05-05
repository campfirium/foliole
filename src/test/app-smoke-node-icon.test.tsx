import { render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { NodeListTree } from '../features/nodes/components/NodeListTree';
import { useWorkspaceStore } from '../store/workspaceStore';

function createNode(args: {
  id: string;
  parentNodeId?: string | null;
  title: string;
}) {
  return {
    anchorLink: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: args.id,
    parentNodeId: args.parentNodeId ?? null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function NodeListTreeHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('folder-a');

  return (
    <NodeListTree
      activeNodeId={activeNodeId}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodeOrder={['folder-a', 'topic-a']}
      nodesById={{
        'folder-a': createNode({ id: 'folder-a', title: 'Folder A' }),
        'topic-a': createNode({ id: 'topic-a', parentNodeId: 'folder-a', title: 'Topic A' })
      }}
      onOpenMoveToNode={() => undefined}
      onOpenNotesView={() => undefined}
      onSelectNode={setActiveNodeId}
      onSelectTrashNode={() => undefined}
      selectedTrashNodeId={null}
    />
  );
}

it('does not show ordinary structure icons in the node list', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));

  render(<NodeListTreeHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const folderRow = within(listPanel).getByRole('treeitem', { name: 'Folder A' });

  expect(folderRow.querySelector('[data-node-icon]')).toBeNull();
});
