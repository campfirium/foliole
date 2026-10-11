import { describe, expect, it } from 'vitest';

import { compareParentOrderNames } from './parentOrderNameOrder.js';

describe('deterministic names for unconstrained inserted children', () => {
  it.each([
    ['Chapter 2', 'Chapter 10', -1], ['章节2', '章节10', -1], ['a', 'b', -1],
    ['', 'a', -1], ['中', '文', -1], ['02', '2', 0], ['Ａ', 'a', 0], ['Ab', 'ab', 0]
  ])('compares %s and %s without host locale', (left, right, sign) => {
    expect(Math.sign(compareParentOrderNames({ id: 'same', title: left },
      { id: 'same', title: right }))).toBe(sign);
  });

  it('breaks equivalent names with UUID byte order', () => {
    expect(compareParentOrderNames({ id: 'a', title: '02' }, { id: 'b', title: '2' })).toBeLessThan(0);
  });
});
