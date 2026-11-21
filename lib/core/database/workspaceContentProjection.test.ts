import { expect, it } from 'vitest';

import { DIVE_NODE_FILTER } from '../nodes/dive.js';
import { createManualVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import {
  canMergeWorkspaceContentProjection, canMergeWorkspaceMetadataProjection, canMergeWorkspaceTrashProjection, mergeWorkspaceContentProjection
} from './workspaceContentProjection.js';
import type { WorkspaceSnapshot } from './workspaceSnapshot.js';

function snapshot(): WorkspaceSnapshot {
  return { activeNodeId: 'topic', nodeOrder: ['topic'], trashedNodeIds: [], trashedNodeDeletedAtById: {},
    untitledSequenceByParent: {}, nodesById: { topic: {
      id: 'topic', kind: 'topic', parentNodeId: null, title: 'Title', content: '',
      isTitleManual: false, hideTitleHeading: false, reveal: null, anchorLink: null,
      reading: null, review: null, createdAt: 'first', updatedAt: 'first'
    } } };
}

it('keeps normalized membership and activity unchanged for content-only updates', () => {
  const current = snapshot();
  current.virtualResultIdsByNodeId = { folder: ['topic'] };
  const nodes = { topic: { ...current.nodesById.topic!, content: 'New text', updatedAt: 'later' } };
  expect(canMergeWorkspaceContentProjection(current, nodes, ['topic'])).toBe(true);
  const merged = mergeWorkspaceContentProjection(current, nodes);
  expect(merged.nodeOrder).toBe(current.nodeOrder);
  expect(merged.trashedNodeDeletedAtById).toBe(current.trashedNodeDeletedAtById);
  expect(merged.activeNodeId).toBe('topic');
  expect(merged.nodesById.topic?.content).toBe('New text');
  expect(merged.virtualResultIdsByNodeId).toBeUndefined();
});

it.each([
  { title: 'Changed title' }, { parentNodeId: 'other' }, { deletedAt: 'later' },
  { kind: 'item' as const }, { manualChildOrder: ['other'] }, { collections: ['Other'] },
  { resourceReferences: [{ storage_key: 'a'.repeat(64) + '.png', role: 'image' as const, original_name: null }] }
])('rejects structural or unclassified changed fields: %j', patch => {
  const current = snapshot();
  const node = { ...current.nodesById.topic!, ...patch };
  expect(canMergeWorkspaceContentProjection(current, { topic: node }, ['topic'])).toBe(false);
});

it('rejects both missing and newly encountered nodes', () => {
  const current = snapshot();
  expect(canMergeWorkspaceContentProjection(current, {}, ['topic'])).toBe(false);
  expect(canMergeWorkspaceContentProjection(current, {
    ...current.nodesById, new: { ...current.nodesById.topic!, id: 'new', parentNodeId: 'topic' }
  }, ['topic'])).toBe(false);
});

it('preserves cached consumers when the selected nodes have not changed', () => {
  const current = snapshot();
  current.virtualResultIdsByNodeId = { folder: ['topic'] };
  const node = current.nodesById.topic!;
  const { id, ...fields } = node;
  const reordered = { ...fields, id };
  expect(canMergeWorkspaceContentProjection(current, { topic: reordered }, ['topic'])).toBe(true);
  expect(mergeWorkspaceContentProjection(current, { topic: reordered })).toBe(current);
});

function withChild() {
  const current = snapshot();
  current.nodesById.child = { ...current.nodesById.topic!, id: 'child', kind: 'item', parentNodeId: 'topic' };
  current.nodeOrder = ['topic', 'child'];
  return current;
}

it('accepts a subtree that only moved into Trash', () => {
  const current = withChild();
  const nodes = { topic: { ...current.nodesById.topic!, deletedAt: 'later', updatedAt: 'later' },
    child: { ...current.nodesById.child!, deletedAt: 'later', updatedAt: 'later' } };
  expect(canMergeWorkspaceTrashProjection(current, nodes, ['topic', 'child'])).toBe(true);
});

it.each([
  ['a child of a trashed node was not read', (current: WorkspaceSnapshot) => ({ topic: { ...current.nodesById.topic!, deletedAt: 'later' } })],
  ['nothing moved into Trash', (current: WorkspaceSnapshot) => ({ topic: current.nodesById.topic!, child: current.nodesById.child! })],
  ['another structural fact changed', (current: WorkspaceSnapshot) => ({ topic: { ...current.nodesById.topic!, deletedAt: 'later', title: 'Other' },
    child: { ...current.nodesById.child!, deletedAt: 'later' } })],
  ['a node was restored', (current: WorkspaceSnapshot) => {
    current.nodesById.child = { ...current.nodesById.child!, deletedAt: 'earlier' };
    return { topic: { ...current.nodesById.topic!, deletedAt: 'later' }, child: { ...current.nodesById.child, deletedAt: null } };
  }]
] as const)('needs a complete snapshot when %s', (_label, change) => {
  const current = withChild();
  const nodes = change(current);
  expect(canMergeWorkspaceTrashProjection(current, nodes as WorkspaceSnapshot['nodesById'], Object.keys(nodes))).toBe(false);
});

it('merges a change to the sources of a Dive or Virtual folder but not to a real folder order or a filter', () => {
  const current = snapshot();
  const dive = { ...current.nodesById.topic!, id: 'dive', kind: 'folder' as const,
    virtualFilter: DIVE_NODE_FILTER, manualChildOrder: ['a'] };
  current.nodesById.dive = dive;
  current.nodesById.folder = { ...dive, id: 'folder', virtualFilter: null };
  expect(canMergeWorkspaceMetadataProjection(current, { dive: { ...dive, manualChildOrder: ['a', 'b'] } }, ['dive'])).toBe(true);
  expect(canMergeWorkspaceMetadataProjection(current, { folder: { ...dive, id: 'folder', virtualFilter: null,
    manualChildOrder: ['a', 'b'] } }, ['folder'])).toBe(false);
  expect(canMergeWorkspaceMetadataProjection(current, { dive: { ...dive, manualChildOrder: ['a', 'b'],
    virtualFilter: createManualVirtualNodeFilter() } }, ['dive'])).toBe(false);
});
