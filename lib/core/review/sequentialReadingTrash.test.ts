import { expect, it } from 'vitest';

import { buildSequentialReadingMaintenancePatch } from './sequentialReadingMaintenance.js';
import { planSequentialReadingSourceStates } from './sequentialReadingSourceStates.js';
import type { SequentialReadingNode } from './sequentialReadingTypes.js';

const now = '2026-11-21T00:00:00.000Z';
const reading = (state: 'active' | 'locked' | 'dismissed') => ({ state, intervalDurationMs: 0, intervalGrowthFactor: 1,
  lastHandledAt: now, nextAt: now, priority: 0, readingPosition: 0, repetitionCount: 0 });
const node = (id: string, parentNodeId: string | null, kind: 'folder' | 'topic',
  extra: Partial<SequentialReadingNode> = {}): SequentialReadingNode =>
  ({ id, parentNodeId, kind, title: id, content: 'text', hasContent: true, createdAt: now, updatedAt: now, ...extra });

function maintain(before: Record<string, SequentialReadingNode>, after: Record<string, SequentialReadingNode>,
  changed: string, nodeOrder: string[]) {
  return buildSequentialReadingMaintenancePatch({ changedRootNodeIds: [changed], defaultPriority: 0,
    nodeOrder, nodesById: after, previousNodesById: before, now })?.changes.map(change =>
    [change.nodeId, change.afterReading?.state]) ?? [];
}

const folderSource = () => ({
  F: node('F', null, 'folder', { sequentialReadingEnabled: true, manualChildOrder: ['a', 'b', 'c'] }),
  a: node('a', 'F', 'topic', { reading: reading('active') }),
  b: node('b', 'F', 'topic', { reading: reading('locked') }),
  c: node('c', 'F', 'topic', { reading: reading('locked') })
});

it('releases the next topic of a folder source when the active topic moves to Trash', () => {
  const before = folderSource();
  const after = { ...before, a: { ...before.a, deletedAt: now } };
  expect(maintain(before, after, 'a', ['F', 'a', 'b', 'c'])).toEqual([['b', 'active']]);
});

it('releases the next topic of a topic source when the active topic moves to Trash', () => {
  const before = {
    F: node('F', null, 'folder'),
    T: node('T', 'F', 'topic', { sequentialReadingEnabled: true }),
    a: node('a', 'T', 'topic', { reading: reading('active') }),
    b: node('b', 'T', 'topic', { reading: reading('locked') })
  };
  const after = { ...before, a: { ...before.a, deletedAt: now } };
  expect(maintain(before, after, 'a', ['F', 'T', 'a', 'b'])).toEqual([['b', 'active']]);
});

it('gives the slot back to a restored topic', () => {
  const trashed = folderSource();
  const before = { ...trashed, a: { ...trashed.a, deletedAt: now }, b: { ...trashed.b, reading: reading('active') } };
  const after = { ...before, a: { ...before.a, deletedAt: null } };
  expect(maintain(before, after, 'a', ['F', 'a', 'b', 'c'])).toEqual([['b', 'locked']]);
});

it('does not let a trashed descendant keep a dismissed topic in its slot', () => {
  const nodes = {
    F: node('F', null, 'folder', { sequentialReadingEnabled: true, manualChildOrder: ['a', 'b'] }),
    a: node('a', 'F', 'topic', { reading: reading('dismissed') }),
    x: node('x', 'a', 'topic', { reading: reading('active') }),
    b: node('b', 'F', 'topic', { reading: reading('locked') })
  };
  const args = { enabled: true, sourceNodeId: 'F', nodeOrder: ['F', 'a', 'x', 'b'] };
  expect(planSequentialReadingSourceStates({ ...args, nodesById: nodes })?.changes).toEqual([]);
  expect(planSequentialReadingSourceStates({ ...args, nodesById: nodes, trashedNodeIds: ['x'] })?.changes)
    .toEqual([{ nodeId: 'b', before: 'locked', after: 'active' }]);
});
