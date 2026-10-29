import { expect, it } from 'vitest';

import { restoreDeletedChildOrder } from './restoreDeletedChildOrder.js';

it.each([
  { current: ['a', 'x', 'b'], saved: ['a', 'x', 'b'], targets: ['x'], expected: ['a', 'x', 'b'] },
  { current: ['x', 'b', 'a', 'new'], saved: ['a', 'x', 'b'], targets: ['x'], expected: ['b', 'a', 'x', 'new'] },
  { current: ['new', 'b', 'x'], saved: ['a', 'x', 'b'], targets: ['x'], expected: ['new', 'x', 'b'] },
  { current: ['new', 'x'], saved: ['a', 'x', 'b'], targets: ['x'], expected: ['new', 'x'] },
  { current: ['new', 'y', 'x'], saved: ['x', 'y'], targets: ['x', 'y'], expected: ['new', 'x', 'y'] },
  { current: ['b', 'y', 'a', 'x'], saved: ['a', 'x', 'b', 'y'], targets: ['x', 'y'], expected: ['b', 'a', 'x', 'y'] },
  { current: ['a', 'other-trash', 'x', 'b'], saved: ['a', 'x', 'b'], targets: ['x'],
    expected: ['a', 'x', 'other-trash', 'b'] },
  { current: ['a', 'b'], saved: ['a', 'x', 'b'], targets: ['x'], expected: ['a', 'b'] }
])('restores deleted positions while retaining other current members: $expected', ({ current, saved, targets, expected }) => {
  expect(restoreDeletedChildOrder(current, saved, new Set(targets))).toEqual(expected);
  expect(current.filter(id => !targets.includes(id))).toEqual(expected.filter(id => !targets.includes(id)));
});
