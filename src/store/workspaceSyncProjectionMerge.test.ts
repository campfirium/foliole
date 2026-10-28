import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceListProjection } from '../../lib/core/database/workspaceListProjection';
import type { Node } from '../features/nodes/model/nodeTypes';
import { readWorkspaceRecordPatch } from '../shared/workspaceRecordPatch';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import type { WorkspaceState } from './workspaceStoreTypes';
import { mergeWorkspaceSyncProjection } from './workspaceSyncProjectionMerge';

function node(id: string, parentNodeId: string | null = null): Node {
  return { id, parentNodeId, kind: 'topic', title: id, isTitleManual: true, hideTitleHeading: false,
    content: '', reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', openingText: null };
}

function projection(nodes: Node[], openings: Record<string, string | null> = {}): WorkspaceListProjection {
  return { nodesById: Object.fromEntries(nodes.map(value => [value.id, { ...value,
    isTitleManual: value.isTitleManual ?? true, hideTitleHeading: value.hideTitleHeading ?? false,
    anchorLink: value.anchorLink ?? null, reading: value.reading ?? null, review: value.review ?? null,
    collections: value.collections ?? [], hasContent: value.hasContent ?? false, hasReveal: value.hasReveal ?? false }])),
    directOpeningById: openings, requestedNodeIds: nodes.map(value => value.id), structure: null,
    nodeOpenStateById: {}, untitledSequenceByParent: {} };
}

afterEach(() => vi.restoreAllMocks());

it.each([100, 1000])('keeps unrelated presentation facts untouched for a scoped update among %i nodes', size => {
  const unrelated = Object.fromEntries(Array.from({ length: size }, (_, index) => {
    const value = node(`other-${index}`);
    return [value.id, value];
  }));
  const current: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(), activeNodeId: 'topic',
    nodesById: { topic: node('topic'), ...unrelated }, nodeOrder: ['topic', ...Object.keys(unrelated)] };
  let unrelatedReads = 0;
  for (const value of Object.values(unrelated)) {
    for (const field of ['title', 'openingText', 'deletedAt'] as const) {
      const original = value[field];
      Object.defineProperty(value, field, { enumerable: true, get: () => { unrelatedReads++; return original; } });
    }
  }
  const next = mergeWorkspaceSyncProjection(current,
    projection([{ ...node('topic'), title: 'Changed', updatedAt: '2027-01-01T00:00:00Z' }], { topic: 'New opening' }));
  expect(next.nodesById.topic).toMatchObject({ title: 'Changed', openingText: 'New opening' });
  expect(next.nodesById['other-0']).toBe(current.nodesById['other-0']);
  expect(unrelatedReads).toBe(0);
  expect(next.nodeOrder).toBe(current.nodeOrder);
  expect(next.trashedNodeIds).toBe(current.trashedNodeIds);
  expect(readWorkspaceRecordPatch(next.nodesById, current.nodesById)).toEqual(['topic']);
});

it('resolves a changed nested opening for its ancestor without changing the published baseline', () => {
  const root = node('root');
  const branch = { ...node('branch', 'root'), kind: 'folder' as const };
  const leaf = { ...node('leaf', 'branch'), openingText: 'Old leaf' };
  root.openingText = 'Old leaf';
  const current: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(), activeNodeId: 'leaf',
    nodesById: { root, branch, leaf, other: node('other') }, nodeOrder: ['root', 'branch', 'leaf', 'other'] };
  const next = mergeWorkspaceSyncProjection(current, projection([
    { ...root, openingText: null }, { ...leaf, openingText: null, updatedAt: '2027-01-01T00:00:00Z' }
  ], { root: null, leaf: 'New leaf' }));
  expect(next.nodesById.root?.openingText).toBe('New leaf');
  expect(next.nodesById.leaf?.openingText).toBe('New leaf');
  expect(next.nodesById.branch).toBe(branch);
  expect(next.nodesById.other).toBe(current.nodesById.other);
  expect(root.openingText).toBe('Old leaf');
  expect(leaf.openingText).toBe('Old leaf');
});


it('keeps a deleted article out of opening presentation during a nonstructural refresh', () => {
  const deletedAt = '2026-10-01T00:00:00Z';
  const archived = { ...node('archived'), deletedAt };
  const current: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(), nodesById: { archived }, nodeOrder: [],
    trashedNodeIds: ['archived'], trashedNodeDeletedAtById: { archived: deletedAt } };
  const next = mergeWorkspaceSyncProjection(current,
    projection([{ ...archived, title: 'New archived title', updatedAt: '2027-01-01T00:00:00Z' }], { archived: 'Hidden body' }));
  expect(next.nodesById.archived).toMatchObject({ title: 'New archived title', deletedAt, openingText: null });
  expect(next.nodeOrder).toEqual([]);
  expect(next.trashedNodeIds).toEqual(['archived']);
});
