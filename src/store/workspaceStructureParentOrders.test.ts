import { expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore, type WorkspaceState } from './workspaceStore';
import { captureStructureParentOrders, restoreStructureParentOrders, structureParentOrdersMatch }
  from './workspaceStructureParentOrders';

function fixture(parents: Array<[string, string | null]>, nodeOrder = parents.map(([id]) => id)) {
  const state = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(), nodeOrder };
  const sample = useWorkspaceStore.getState().nodesById;
  state.nodesById = Object.fromEntries(parents.map(([id, parentNodeId]) => [id, {
    ...Object.values(sample)[0], id, parentNodeId
  }])) as WorkspaceState['nodesById'];
  return state;
}

it('captures complete direct siblings in traversal order, including tombstones and duplicate ids', () => {
  const state = fixture([['root', null], ['a', 'root'], ['leaf', 'a'], ['b', 'root'],
    ['trash', 'root'], ['orphan', 'absent']], ['root', 'b', 'missing', 'a', 'leaf', 'trash', 'b', 'orphan']);
  state.trashedNodeIds = ['trash'];
  const orders = captureStructureParentOrders(state, ['root', null, 'root', 'absent', 'empty']);
  expect(orders).toEqual([
    { parentNodeId: 'root', childIds: ['b', 'a', 'trash', 'b'] },
    { parentNodeId: null, childIds: ['root'] },
    { parentNodeId: 'absent', childIds: ['orphan'] },
    { parentNodeId: 'empty', childIds: [] }
  ]);
  expect(structureParentOrdersMatch(state, orders)).toBe(true);
  expect(structureParentOrdersMatch({ ...state, trashedNodeIds: [] }, orders)).toBe(true);
  expect(structureParentOrdersMatch(state, [...orders, orders[0]!])).toBe(true);
  expect(structureParentOrdersMatch(state, [...orders, { parentNodeId: 'root', childIds: ['a'] }])).toBe(false);
  expect(structureParentOrdersMatch({ ...state, nodeOrder: state.nodeOrder.filter(id => id !== 'trash') }, orders))
    .toBe(false);
});

it('rejects changed membership and order while ignoring unrelated structure and document facts', () => {
  const state = fixture([['a', 'p'], ['b', 'p'], ['x', 'q'], ['y', 'q']]);
  const orders = captureStructureParentOrders(state, ['p']);
  expect(structureParentOrdersMatch({ ...state, nodeOrder: ['a', 'y', 'b', 'x'] }, orders)).toBe(true);
  expect(structureParentOrdersMatch({ ...state, nodeOrder: ['b', 'a', 'x', 'y'] }, orders)).toBe(false);
  expect(structureParentOrdersMatch({ ...state, nodesById: { ...state.nodesById,
    b: { ...state.nodesById.b!, parentNodeId: 'q' } } }, orders)).toBe(false);
  expect(structureParentOrdersMatch({ ...state, nodesById: { ...state.nodesById,
    a: { ...state.nodesById.a!, content: 'Current body', title: 'Current title' } } }, orders)).toBe(true);
});

it('restores recorded siblings without reverting unrelated order or dropping surviving nodes', () => {
  const state = fixture([['p', null], ['q', null], ['a', 'p'], ['b', 'p'], ['leaf', 'a'],
    ['x', 'q'], ['y', 'q']], ['p', 'b', 'a', 'leaf', 'q', 'y', 'x']);
  state.trashedNodeIds = ['b'];
  const nodeOrder = restoreStructureParentOrders(state, [{ parentNodeId: 'p', childIds: ['a', 'missing', 'b'] }]);
  expect(nodeOrder).toEqual(['p', 'a', 'leaf', 'b', 'q', 'y', 'x']);
  expect(state.nodeOrder).toEqual(['p', 'b', 'a', 'leaf', 'q', 'y', 'x']);
});

it.each([100, 1000])('reads each relationship once for many requested parents with %i unrelated nodes', (size) => {
  const parents: Array<[string, string | null]> = [
    ...Array.from({ length: 8 }, (_, i): [string, string] => [`child-${i}`, `parent-${i}`]),
    ...Array.from({ length: size }, (_, i): [string, string] => [`other-${i}`, 'unrelated'])
  ];
  const state = fixture(parents);
  let reads = 0;
  for (const node of Object.values(state.nodesById)) {
    const parent = node.parentNodeId;
    Object.defineProperty(node, 'parentNodeId', { get: () => { reads += 1; return parent; } });
  }
  const requested = Array.from({ length: 8 }, (_, i) => `parent-${i}`);
  const expected = requested.map((parentNodeId, i) => ({ parentNodeId, childIds: [`child-${i}`] }));
  expect(captureStructureParentOrders(state, requested)).toEqual(expected);
  expect.soft(reads).toBeLessThanOrEqual(state.nodeOrder.length);
  reads = 0;
  expect(structureParentOrdersMatch(state, expected)).toBe(true);
  expect.soft(reads).toBeLessThanOrEqual(state.nodeOrder.length);
});

it('does no relationship work when no parent orders are requested', () => {
  const state = fixture([['a', null]]);
  Object.defineProperty(state.nodesById.a!, 'parentNodeId', { get: () => { throw new Error('unused'); } });
  expect(captureStructureParentOrders(state, [])).toEqual([]);
  expect(structureParentOrdersMatch(state, [])).toBe(true);
});
