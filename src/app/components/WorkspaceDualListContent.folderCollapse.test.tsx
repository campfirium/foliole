import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { DIVE_NODE_FILTER } from '../../../lib/core/nodes/dive';
import { HOME_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { projectWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { resetExternalCollapsedRowIds } from './externalLibraryCollapseSettings';
import { createWorkspaceContentNode, renderWorkspaceContent } from './WorkspaceDualListContent.testUtils';

vi.mock('../../shared/platform/desktop/diveRepository', () => ({ getDiveRepository: () => ({}) }));

beforeEach(() => {
  localStorage.clear();
  resetExternalCollapsedRowIds();
});

it('collapses a mixed sidebar to each section’s first level and then expands its branches', () => {
  const nodes = {
    [HOME_NODE_ID]: createWorkspaceContentNode({ id: HOME_NODE_ID, kind: 'folder', specialKind: 'home', title: 'Home' }),
    source: createWorkspaceContentNode({ id: 'source', kind: 'folder', title: 'Source' }),
    nested: createWorkspaceContentNode({ id: 'nested', kind: 'folder', title: 'Nested', parentNodeId: 'source' }),
    dive: {
      ...createWorkspaceContentNode({ id: 'dive', kind: 'folder', specialKind: 'virtual', title: 'Probability' }),
      virtualFilter: DIVE_NODE_FILTER,
      manualChildOrder: ['source']
    },
    [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
    index: createWorkspaceContentNode({ id: 'index', kind: 'folder', specialKind: 'virtual', title: 'Index folder', parentNodeId: VIRTUAL_ROOT_NODE_ID }),
    saved: createWorkspaceContentNode({ id: 'saved', kind: 'folder', specialKind: 'virtual', title: 'Saved search', parentNodeId: 'index' })
  };
  renderWorkspaceContent({
    nodesById: nodes,
    listNodesById: projectWorkspaceListNodesById(nodes),
    nodeOrder: Object.keys(nodes),
    externalFolders: [{
      attachmentMode: 'document_relative_first_then_fixed_root', attachmentRootPath: null,
      createdAt: '2026-04-21T00:00:00.000Z', documentCount: 1, excludedDirs: [], folderPath: '/Reference',
      id: 'ref', indexedAt: null, lastError: null, status: 'ready', updatedAt: '2026-04-21T00:00:00.000Z'
    }],
    externalEntriesByFolderId: { ref: [{
      absolutePath: '/Reference/Archive/ref.md', extension: 'md', fileName: 'ref.md', folderId: 'ref',
      folderPath: '/Reference', modifiedAt: '2026-04-21T00:00:00.000Z', openingText: '',
      relativePath: 'Archive/ref.md', title: 'Reference note'
    }] }
  });

  const dive = within(screen.getByRole('tree', { name: 'Dive' }));
  const external = within(screen.getByRole('tree', { name: 'External folder tree' }));
  fireEvent.keyDown(external.getByRole('treeitem', { name: 'External' }), { key: 'ArrowLeft' });
  expect(dive.getByRole('treeitem', { name: 'Source' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
  expect(screen.getByRole('treeitem', { name: /^Source/ })).toBeVisible();
  expect(dive.getByRole('treeitem', { name: 'Probability' })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'Index folder' })).toBeVisible();
  expect(external.getByRole('treeitem', { name: /^Reference/ })).toBeVisible();
  expect(dive.queryByRole('treeitem', { name: 'Source' })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: 'Saved search' })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: 'Nested' })).toBeNull();
  expect(external.queryByRole('treeitem', { name: /^Archive/ })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
  expect(dive.getByRole('treeitem', { name: 'Source' })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'Saved search' })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'Nested' })).toBeVisible();
  expect(external.getByRole('treeitem', { name: /^Archive/ })).toBeVisible();
});
