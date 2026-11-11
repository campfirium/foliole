import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { DIVE_NODE_FILTER } from '../../../lib/core/nodes/dive';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { HOME_NODE_ID } from '../../features/nodes/model/specialNodes';
import { projectWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

vi.mock('../../shared/platform/desktop/diveRepository', () => ({
  getDiveRepository: () => ({})
}));

function Workspace({ nodesById, trashedNodeIds = [] }: { nodesById: Record<string, Node>; trashedNodeIds?: string[] }) {
  const [activeNodeId, setActiveNodeId] = useState(HOME_NODE_ID);
  return <WorkspaceDualListContent
    activeNodeId={activeNodeId}
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
    onSelectNode={setActiveNodeId}
    onSelectNodeInVirtualView={vi.fn()}
    onSelectTrashNode={vi.fn()}
    reviewCurrentNodeId={null}
    selectedTrashNodeId={null}
    trashedNodeIds={trashedNodeIds}
  />;
}

it('keeps the selected Dive live as a subfolder moves out of a source', async () => {
  const nodes = {
    [HOME_NODE_ID]: createWorkspaceContentNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
    dive: {
      ...createWorkspaceContentNode({ id: 'dive', kind: 'folder', specialKind: 'virtual', title: 'Probability' }),
      virtualFilter: DIVE_NODE_FILTER,
      manualChildOrder: ['source', 'direct']
    },
    source: createWorkspaceContentNode({ id: 'source', kind: 'folder', title: 'Source' }),
    nested: createWorkspaceContentNode({ id: 'nested', kind: 'folder', title: 'Nested', parentNodeId: 'source' }),
    derived: createWorkspaceContentNode({ id: 'derived', kind: 'topic', title: 'Included through folder', parentNodeId: 'nested' }),
    item: createWorkspaceContentNode({ id: 'item', kind: 'item', title: 'Derived card', parentNodeId: 'derived' }),
    direct: createWorkspaceContentNode({ id: 'direct', kind: 'topic', title: 'Also added directly', parentNodeId: 'nested' })
  };
  const view = renderWithLocalization(<Workspace nodesById={nodes} />);
  const dive = await screen.findByRole('treeitem', { name: 'Probability' });
  fireEvent.click(dive);
  const dives = within(screen.getByRole('tree', { name: 'Dive' }));
  expect(dives.getByRole('treeitem', { name: 'Source' })).toBeVisible();
  const panel = within(screen.getByRole('complementary', { name: 'Current folder contents' }));
  expect(dive).toHaveAttribute('aria-selected', 'true');
  const topic = panel.getByRole('treeitem', { name: /Included through folder/ });
  expect(topic).toBeVisible();
  expect(panel.queryByText('Probability')).toBeNull();
  const chevron = topic.querySelector('[data-node-tree-chevron]');
  expect(chevron).not.toBeNull();
  if (topic.getAttribute('aria-expanded') === 'false') fireEvent.click(chevron!);
  expect(panel.getByRole('treeitem', { name: 'Derived card' })).toHaveAttribute('aria-level', '2');

  expect(panel.getAllByRole('treeitem', { name: 'Also added directly' })).toHaveLength(1);

  view.rerender(<Workspace nodesById={nodes} trashedNodeIds={['source', 'nested', 'derived', 'direct', 'item']} />);
  expect(dives.queryByRole('treeitem', { name: 'Source' })).toBeNull();
  expect(panel.queryByRole('treeitem', { name: /Included through folder/ })).toBeNull();
  view.rerender(<Workspace nodesById={nodes} />);
  expect(dives.getByRole('treeitem', { name: 'Source' })).toBeVisible();
  expect(panel.getByRole('treeitem', { name: /Included through folder/ })).toBeVisible();

  view.rerender(<Workspace nodesById={{ ...nodes, nested: { ...nodes.nested, parentNodeId: null } }} />);
  expect(dive).toHaveAttribute('aria-selected', 'true');
  expect(panel.queryByRole('treeitem', { name: /Included through folder/ })).not.toBeInTheDocument();
  expect(panel.getByRole('treeitem', { name: 'Also added directly' })).toBeVisible();
});

it('renames the Dive section from its menu and restores the name after remount', async () => {
  const nodes = {
    [HOME_NODE_ID]: createWorkspaceContentNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' })
  };
  const view = renderWithLocalization(<Workspace nodesById={nodes} />);
  const heading = screen.getByRole('treeitem', { name: 'Dive' });

  fireEvent.doubleClick(heading);
  expect(screen.queryByRole('textbox', { name: 'Rename Dive' })).toBeNull();
  fireEvent.contextMenu(heading);
  expect(screen.getByRole('menuitem', { name: 'Create Dive' })).toBeVisible();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
  const input = await screen.findByRole('textbox', { name: 'Rename Dive' });
  fireEvent.change(input, { target: { value: 'Reading projects' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(await screen.findByRole('treeitem', { name: 'Reading projects' })).toBeVisible();

  view.unmount();
  renderWithLocalization(<Workspace nodesById={nodes} />);
  expect(screen.getByRole('treeitem', { name: 'Reading projects' })).toBeVisible();
});
