import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { DIVE_NODE_FILTER } from '../../../lib/core/nodes/dive';
import { HOME_NODE_ID, VIRTUAL_PUBLISHED_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { projectWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

vi.mock('../../shared/platform/desktop/diveRepository', () => ({
  getDiveRepository: () => ({})
}));

const nodes = {
  [HOME_NODE_ID]: createWorkspaceContentNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
  [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
  first: createWorkspaceContentNode({
    id: 'first', kind: 'folder', specialKind: 'virtual', title: 'First project',
    virtualFilter: DIVE_NODE_FILTER, manualChildOrder: ['source']
  }),
  second: createWorkspaceContentNode({
    id: 'second', kind: 'folder', specialKind: 'virtual', title: 'Second project',
    virtualFilter: DIVE_NODE_FILTER, manualChildOrder: ['source']
  }),
  source: createWorkspaceContentNode({ id: 'source', kind: 'folder', title: 'Source' })
};
const listNodesById = projectWorkspaceListNodesById(nodes);
const nodeOrder = Object.keys(nodes);

function Workspace() {
  const [activeNodeId, setActiveNodeId] = useState(HOME_NODE_ID);
  const [activeVirtualNodeId, setActiveVirtualNodeId] = useState<string | null>(null);
  return (
    <WorkspaceDualListContent
      activeNodeId={activeNodeId}
      activeVirtualNodeId={activeVirtualNodeId}
      browseRootNodeId={activeNodeId}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
      isStudyMode={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={activeVirtualNodeId !== null}
      listNodesById={listNodesById}
      nodeOrder={nodeOrder}
      nodesById={nodes}
      onOpenExternalSelection={vi.fn()}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={() => setActiveVirtualNodeId(null)}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={(id) => setActiveVirtualNodeId(id ?? VIRTUAL_ROOT_NODE_ID)}
      onSelectNode={setActiveNodeId}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );
}

it('shows selection only at the navigation entry used, even when a folder appears in several places', async () => {
  const { container } = renderWithLocalization(<Workspace />);
  const column = within(container.querySelector('.workspace-folder-column') as HTMLElement);
  const home = column.getByRole('treeitem', { name: 'Home' });
  const dives = within(screen.getByRole('tree', { name: 'Dive' }));
  const dive = await dives.findByRole('treeitem', { name: 'First project' });
  const diveHeading = dives.getByRole('treeitem', { name: 'Dive' });
  expect(diveHeading).toHaveAttribute('aria-expanded', 'true');
  const [firstSource, secondSource] = dives
    .getAllByRole('treeitem', { name: 'Source' });
  const [regularSource] = column.getAllByRole('treeitem', { name: 'Source' });
  const published = column.getByRole('treeitem', { name: 'Published' });

  expect(home).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(dive);
  expect(dive).toHaveAttribute('aria-selected', 'true');
  expect(home).toHaveAttribute('aria-selected', 'false');

  fireEvent.click(firstSource!);
  expect(firstSource).toHaveAttribute('aria-selected', 'true');
  for (const row of [home, dive, regularSource, secondSource]) {
    expect(row).toHaveAttribute('aria-selected', 'false');
    expect(row).not.toHaveAttribute('data-node-location-highlight');
  }

  fireEvent.click(published);
  expect(published).toHaveAttribute('data-node-id', VIRTUAL_PUBLISHED_NODE_ID);
  expect(published).toHaveAttribute('aria-selected', 'true');
  expect(firstSource).toHaveAttribute('aria-selected', 'false');
  expect(home).toHaveAttribute('aria-selected', 'false');

  fireEvent.click(home);
  expect(home).toHaveAttribute('aria-selected', 'false');
  expect(published).toHaveAttribute('aria-selected', 'true');
  expect(dive).toBeVisible();

  expect(regularSource).not.toBeInTheDocument();
  fireEvent.click(home);
  const [reopenedSource] = column.getAllByRole('treeitem', { name: 'Source' });
  fireEvent.click(reopenedSource!);
  expect(reopenedSource).toHaveAttribute('aria-selected', 'true');
  expect(published).toHaveAttribute('aria-selected', 'false');
  expect(firstSource).toHaveAttribute('aria-selected', 'false');
  expect(secondSource).toHaveAttribute('aria-selected', 'false');
});
