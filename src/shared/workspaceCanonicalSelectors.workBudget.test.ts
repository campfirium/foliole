import { expect, it } from 'vitest';

import {
  selectCanonicalTrashedNodeIds,
  selectCanonicalVisibleNodeIds
} from './workspaceCanonicalSelectors';

it.each([
  { kind: 'visible', select: selectCanonicalVisibleNodeIds },
  { kind: 'trashed', select: selectCanonicalTrashedNodeIds }
])('bounds legacy membership reads while selecting $kind nodes', ({ kind, select }) => {
  const ids = Array.from({ length: 800 }, (_, index) => `node-${index}`);
  let elementReads = 0;
  const trashedNodeIds = new Proxy(ids.slice(0, 400), {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) elementReads += 1;
      return Reflect.get(target, key, receiver);
    }
  });
  const source = {
    nodeOrder: ids,
    nodesById: Object.fromEntries(ids.map((id) => [id, { id }])),
    trashedNodeIds
  };

  expect(select(source)).toEqual(kind === 'visible' ? ids.slice(400) : ids.slice(0, 400));
  expect(elementReads).toBeLessThanOrEqual(4 * (ids.length + trashedNodeIds.length));
});

it('reads current membership when the same legacy array is updated between selections', () => {
  const source = {
    nodeOrder: ['a', 'b', 'a'],
    nodesById: { a: { id: 'a' }, b: { id: 'b' } },
    trashedNodeIds: ['a']
  };

  expect(selectCanonicalVisibleNodeIds(source)).toEqual(['b']);
  expect(selectCanonicalTrashedNodeIds(source)).toEqual(['a']);
  source.trashedNodeIds.splice(0, 1, 'b');
  expect(selectCanonicalVisibleNodeIds(source)).toEqual(['a']);
  expect(selectCanonicalTrashedNodeIds(source)).toEqual(['b']);
});
