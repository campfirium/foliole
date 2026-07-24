import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { HOME_NODE_ID, VIRTUAL_PUBLISHED_NODE_ID, VIRTUAL_REMOVED_NODE_ID } from '../features/nodes/model/specialNodes';

import { resolveWorkspaceBrowseRootForTarget, resolveWorkspaceBrowseRootNodeId } from './workspaceBrowseRoot';

function createFolder(id: string, specialKind?: Node['specialKind']): Node {
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
    ...(specialKind ? { specialKind } : {}),
    title: id,
    updatedAt: '2026-07-17T00:00:00.000Z'
  };
}

it('keeps a custom virtual folder while opening one of its physical Topics', () => {
  const nodesById = {
    'folder-a': createFolder('folder-a'),
    'virtual-a': createFolder('virtual-a', 'virtual'),
    'topic-a': createTopic('topic-a', 'folder-a')
  };

  expect(resolveWorkspaceBrowseRootForTarget({
    browseRootNodeId: 'virtual-a', intent: 'current-context', nodesById, targetNodeId: 'topic-a', trashedNodeIds: []
  })).toBe('virtual-a');
  expect(resolveWorkspaceBrowseRootForTarget({
    browseRootNodeId: 'virtual-a', intent: 'target-context', nodesById, targetNodeId: 'topic-a', trashedNodeIds: []
  })).toBe('folder-a');
});

function createTopic(id: string, parentNodeId: string | null): Node {
  return {
    ...createFolder(id),
    content: id,
    kind: 'topic',
    parentNodeId
  };
}

it('keeps visible folders and built-in virtual ranges as browse roots', () => {
  const nodesById = { 'folder-a': createFolder('folder-a') };

  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: 'folder-a', nodesById, trashedNodeIds: [] }))
    .toBe('folder-a');
  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: VIRTUAL_REMOVED_NODE_ID, nodesById, trashedNodeIds: [] }))
    .toBe(VIRTUAL_REMOVED_NODE_ID);
  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: VIRTUAL_PUBLISHED_NODE_ID, nodesById, trashedNodeIds: [] }))
    .toBe(VIRTUAL_PUBLISHED_NODE_ID);
});

it('returns Home when a saved browse root is missing or trashed', () => {
  const nodesById = { 'folder-a': createFolder('folder-a') };

  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: 'missing', nodesById, trashedNodeIds: [] }))
    .toBe(HOME_NODE_ID);
  expect(resolveWorkspaceBrowseRootNodeId({ browseRootNodeId: 'folder-a', nodesById, trashedNodeIds: ['folder-a'] }))
    .toBe(HOME_NODE_ID);
});

it('keeps the current collection for direct selection and locates global navigation targets', () => {
  const nodesById = {
    'folder-a': createFolder('folder-a'),
    'folder-b': createFolder('folder-b'),
    'topic-a': createTopic('topic-a', 'folder-a'),
    'topic-b': createTopic('topic-b', 'folder-b')
  };

  expect(resolveWorkspaceBrowseRootForTarget({
    browseRootNodeId: 'folder-a', intent: 'current-context', nodesById, targetNodeId: 'topic-a', trashedNodeIds: []
  })).toBe('folder-a');
  expect(resolveWorkspaceBrowseRootForTarget({
    browseRootNodeId: 'folder-a', intent: 'target-context', nodesById, targetNodeId: 'topic-b', trashedNodeIds: []
  })).toBe('folder-b');
});

it('resolves a nested Topic target to its physical folder', () => {
  const nodesById = {
    'folder-b': createFolder('folder-b'),
    'topic-parent': createTopic('topic-parent', 'folder-b'),
    'topic-child': createTopic('topic-child', 'topic-parent')
  };

  expect(resolveWorkspaceBrowseRootForTarget({
    browseRootNodeId: HOME_NODE_ID,
    intent: 'target-context',
    nodesById,
    targetNodeId: 'topic-child',
    trashedNodeIds: []
  })).toBe('folder-b');
});
