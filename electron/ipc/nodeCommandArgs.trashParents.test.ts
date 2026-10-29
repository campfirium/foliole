import { expect, it } from 'vitest';

import { parseRestoreNodesArgs, parseSoftDeleteNodesArgs } from './nodeCommandArgs.js';

const parent = { nodeId: 'parent', imageRegions: null, updatedAt: '2026-09-21T00:00:00.000Z' };

it('passes parent-local saved orders only to restore', () => {
  const parentOrders = [{ parentNodeId: null, childIds: ['a', 'child', 'b'] }];
  expect(parseRestoreNodesArgs({ nodeIds: ['child'], parentOrders }).parentOrders).toEqual(parentOrders);
  expect(parseSoftDeleteNodesArgs({ nodeIds: ['child'], deletedAt: parent.updatedAt, parentOrders }).parentOrders).toBeUndefined();
});

it('preserves a distinct saved folder display order', () => {
  const parentOrders = [{ parentNodeId: 'p', childIds: ['a', 'x', 'b'], manualChildIds: ['b', 'x', 'a'] }];
  expect(parseRestoreNodesArgs({ nodeIds: ['x'], parentOrders }).parentOrders).toEqual(parentOrders);
  expect(() => parseRestoreNodesArgs({ nodeIds: ['x'], parentOrders: [{ ...parentOrders[0], manualChildIds: [1] }] })).toThrow();
});

it.each([null, {}, [null], [{}], [{ parentNodeId: '', childIds: ['x'] }],
  [{ parentNodeId: 'p', childIds: ['x', 'x'] }], [{ parentNodeId: 'p', childIds: [1] }],
  [{ parentNodeId: 'p', childIds: ['x'] }, { parentNodeId: 'p', childIds: ['y'] }]])(
  'rejects malformed saved restore orders: %j', parentOrders => {
    expect(() => parseRestoreNodesArgs({ nodeIds: ['child'], parentOrders })).toThrow();
  }
);

it.each([parseRestoreNodesArgs, parseSoftDeleteNodesArgs])('parses atomic parent updates with existing Trash commands', (parse) => {
  const args = { nodeIds: ['child'], deletedAt: parent.updatedAt, parentUpdates: [parent] };
  expect(parse(args).parentUpdates).toEqual([parent]);
  expect(parse({ nodeIds: ['child'], deletedAt: parent.updatedAt }).parentUpdates).toBeUndefined();
});

it.each([null, {}, [null], [{}], [{ ...parent, imageRegions: 'bad' }], [{ ...parent, updatedAt: '' }]])(
  'rejects malformed parent updates before performing any mutation: %j', (parentUpdates) => {
    expect(() => parseSoftDeleteNodesArgs({ nodeIds: ['child'], deletedAt: parent.updatedAt, parentUpdates })).toThrow();
    expect(() => parseRestoreNodesArgs({ nodeIds: ['child'], parentUpdates })).toThrow();
  }
);
