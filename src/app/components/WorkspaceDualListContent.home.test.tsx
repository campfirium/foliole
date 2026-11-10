import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

vi.mock('../../shared/platform/desktop/diveRepository', () => ({
  getDiveRepository: () => ({})
}));

beforeEach(() => window.localStorage.clear());

function HomePinnedWorkspaceHarness({ onSelect }: { onSelect?: (nodeId: string) => void } = {}) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(HOME_NODE_ID);
  const nodesById = {
    [HOME_NODE_ID]: createWorkspaceContentNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
    [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
    'folder-a': createWorkspaceContentNode({ id: 'folder-a', kind: 'folder', title: 'Folder A' }),
    'folder-child': createWorkspaceContentNode({ id: 'folder-child', kind: 'folder', parentNodeId: 'folder-a', title: 'Child Folder' }),
    'topic-a': createWorkspaceContentNode({ id: 'topic-a', kind: 'topic', parentNodeId: 'folder-child', title: 'Topic A' })
  };

  return (
    <WorkspaceDualListContent
      activeNodeId={activeNodeId}
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen={false}
      isStudyMode={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodesById={nodesById}
      listNodesById={nodesById}
      nodeOrder={[HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'folder-a', 'folder-child', 'topic-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={(nodeId) => {
        onSelect?.(nodeId);
        setActiveNodeId(nodeId);
      }}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );
}

it('keeps Home selected and reveals the source folder when opening a Home topic', () => {
  renderWithLocalization(<HomePinnedWorkspaceHarness />);

  const folderColumn = screen.getAllByRole('tree', { name: 'Topic list' })[0]!;
  expect(within(folderColumn).getByRole('treeitem', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  expect(within(folderColumn).queryByRole('treeitem', { name: 'Child Folder' })).toBeNull();

  const contentColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.click(within(contentColumn).getByRole('treeitem', { name: 'Topic A' }));

  expect(within(folderColumn).getByRole('treeitem', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  expect(within(folderColumn).getByRole('treeitem', { name: 'Folder A' })).toHaveAttribute('aria-expanded', 'true');
  expect(within(folderColumn).getByRole('treeitem', { name: 'Child Folder' })).toHaveAttribute('data-node-location-highlight', 'true');
  expect(within(contentColumn).getByRole('treeitem', { name: 'Topic A' })).toHaveAttribute('aria-current', 'page');
});

it('keeps double-click rename available for folders but not for the Home section', () => {
  renderWithLocalization(<HomePinnedWorkspaceHarness />);

  fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'Home' }));
  expect(screen.queryByRole('textbox', { name: 'Rename Home' })).toBeNull();

  fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'Folder A' }));
  expect(screen.getByRole('textbox', { name: 'Rename Folder A' })).toBeVisible();
});

it('toggles Home from its title without opening another view', () => {
  const onSelect = vi.fn();
  renderWithLocalization(<HomePinnedWorkspaceHarness onSelect={onSelect} />);

  const home = screen.getByRole('treeitem', { name: 'Home' });
  fireEvent.click(home);
  expect(home).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('treeitem', { name: 'Folder A' })).toBeNull();

  fireEvent.click(home);
  expect(home).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('treeitem', { name: 'Folder A' })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'Trash' })).toBeVisible();
  expect(onSelect).not.toHaveBeenCalled();
});

it.each([false, true])('folds Home without closing its current contents or the other sections (topic open: %s)', (openTopic) => {
  renderWithLocalization(<HomePinnedWorkspaceHarness />);

  if (openTopic) fireEvent.click(screen.getByRole('treeitem', { name: 'Topic A' }));

  const home = screen.getByRole('treeitem', { name: 'Home' });
  expect(home).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(home.querySelector('[data-node-tree-chevron]')!);

  expect(home).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('treeitem', { name: 'Inbox' })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: 'Trash' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Topic A' })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'External' })).toBeVisible();

  fireEvent.keyDown(home, { key: 'ArrowRight' });
  expect(home).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('treeitem', { name: 'Inbox' })).toBeVisible();
});

it.each([false, true])('toggles all four section headings and preserves nested folder state (expanded: %s)', (expanded) => {
  renderWithLocalization(<HomePinnedWorkspaceHarness />);

  const folder = screen.getByRole('treeitem', { name: 'Folder A' });
  const headings = ['Home', 'Dive', 'Virtual', 'External'].map((name) =>
    screen.getByRole('treeitem', { name })
  );
  expect(screen.getAllByRole('treeitem').filter((row) => headings.includes(row))).toEqual(headings);
  for (const heading of headings) expect(heading).toHaveAttribute('aria-expanded', 'true');
  if (expanded) fireEvent.keyDown(folder, { key: 'ArrowRight' });
  expect(folder).toHaveAttribute('aria-expanded', String(expanded));

  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
  for (const heading of headings) expect(heading).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('treeitem', { name: 'Folder A' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
  for (const heading of headings) expect(heading).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('treeitem', { name: 'Folder A' })).toHaveAttribute('aria-expanded', String(expanded));

  fireEvent.click(screen.getByRole('treeitem', { name: 'Virtual' }));
  expect(headings[0]).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
  for (const heading of headings) expect(heading).toHaveAttribute('aria-expanded', 'true');
});
