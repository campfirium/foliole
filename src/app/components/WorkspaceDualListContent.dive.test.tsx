import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { HOME_NODE_ID } from '../../features/nodes/model/specialNodes';
import { projectWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

vi.mock('../../shared/platform/desktop/diveRepository', () => ({
  getDiveRepository: () => ({
    list: async () => [{ id: 'dive', title: 'Probability', directSourceIds: ['source', 'direct'] }]
  }),
  subscribeToDiveChanges: () => () => undefined
}));

function createContent(nodesById: Record<string, Node>) {
  return <WorkspaceDualListContent
    activeNodeId={HOME_NODE_ID}
    externalEntriesByFolderId={{}}
    externalFolders={[]}
    externalSelection={{ kind: 'root' }}
    isExternalViewOpen={false}
    isStudyMode={false}
    isTrashViewOpen={false}
    isVirtualViewOpen={false}
    listNodesById={projectWorkspaceListNodesById(nodesById)}
    nodeOrder={Object.keys(nodesById)}
    nodesById={nodesById}
    onOpenExternalSelection={vi.fn()}
    onOpenMoveToNode={vi.fn()}
    onOpenNotesView={vi.fn()}
    onOpenTrashView={vi.fn()}
    onSelectNode={vi.fn()}
    onSelectNodeInVirtualView={vi.fn()}
    onSelectTrashNode={vi.fn()}
    reviewCurrentNodeId={null}
    selectedTrashNodeId={null}
    trashedNodeIds={[]}
  />;
}

it('keeps the selected Dive live as a subfolder moves out of a source', async () => {
  const nodes = {
    [HOME_NODE_ID]: createWorkspaceContentNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
    source: createWorkspaceContentNode({ id: 'source', kind: 'folder', title: 'Source' }),
    nested: createWorkspaceContentNode({ id: 'nested', kind: 'folder', title: 'Nested', parentNodeId: 'source' }),
    derived: createWorkspaceContentNode({ id: 'derived', kind: 'topic', title: 'Included through folder', parentNodeId: 'nested' }),
    direct: createWorkspaceContentNode({ id: 'direct', kind: 'topic', title: 'Also added directly', parentNodeId: 'nested' })
  };
  const view = renderWithLocalization(createContent(nodes));
  const dive = await screen.findByRole('treeitem', { name: 'Probability' });
  fireEvent.click(dive);
  const panel = within(screen.getByRole('complementary', { name: 'Current folder contents' }));
  expect(dive).toHaveAttribute('aria-selected', 'true');
  expect(panel.getByRole('treeitem', { name: 'Included through folder' })).toBeVisible();
  expect(panel.getAllByRole('treeitem', { name: 'Also added directly' })).toHaveLength(1);

  view.rerender(createContent({ ...nodes, nested: { ...nodes.nested, parentNodeId: null } }));
  expect(dive).toHaveAttribute('aria-selected', 'true');
  expect(panel.queryByRole('treeitem', { name: 'Included through folder' })).not.toBeInTheDocument();
  expect(panel.getByRole('treeitem', { name: 'Also added directly' })).toBeVisible();
});
