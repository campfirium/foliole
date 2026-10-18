import { expect, it } from 'vitest';

import { canMergeWorkspaceContentProjection, mergeWorkspaceContentProjection } from './workspaceContentProjection.js';
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
