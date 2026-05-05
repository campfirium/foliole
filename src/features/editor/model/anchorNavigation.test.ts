import { describe, expect, it } from 'vitest';

import { findAnchorSelection } from './anchorNavigation';

describe('anchorNavigation', () => {
  it('finds selection range for basic anchor pair', () => {
    const content = 'A<highlight id="1">BC</highlight id="1">D';
    expect(findAnchorSelection(content, { id: '1', kind: 'highlight' })).toEqual({
      from: content.indexOf('BC'),
      to: content.indexOf('BC') + 2
    });
  });

  it('finds selection range for overlapping anchors', () => {
    const content = 'X<highlight id="1">12<highlight id="2">34</highlight id="1">56</highlight id="2">Y';
    const first = findAnchorSelection(content, { id: '1', kind: 'highlight' });
    const second = findAnchorSelection(content, { id: '2', kind: 'highlight' });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.from).toBe(content.indexOf('12'));
    expect(second!.from).toBe(content.indexOf('34'));
    expect(first!.to).toBeGreaterThan(first!.from);
    expect(second!.to).toBeGreaterThan(second!.from);
  });
});
