import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { HOME_NODE_ID, VIRTUAL_REMOVED_NODE_ID } from '../features/nodes/model/specialNodes';

import { resolveWorkspaceBrowseRootNodeId } from './workspaceBrowseRoot';

function createFolder(id: string): Node {
  return {
    content: '',
    createdAt: '2026-07-17T00:00:00.000Z',
    id,
    isTitleManual: true,
    kind: 'folder',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-07-17T00:00:00.000Z'
  };
}

it('keeps visible folders and built-in virtual ranges as browse roots', () => {
  const nodesById = { 'folder-a': createFolder('folder-a') };

  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: 'folder-a', nodesById, trashedNodeIds: [] }))
    .toBe('folder-a');
  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: VIRTUAL_REMOVED_NODE_ID, nodesById, trashedNodeIds: [] }))
    .toBe(VIRTUAL_REMOVED_NODE_ID);
});

it('returns Home when a saved browse root is missing or trashed', () => {
  const nodesById = { 'folder-a': createFolder('folder-a') };

  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: 'missing', nodesById, trashedNodeIds: [] }))
    .toBe(HOME_NODE_ID);
  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: 'folder-a', nodesById, trashedNodeIds: ['folder-a'] }))
    .toBe(HOME_NODE_ID);
});
