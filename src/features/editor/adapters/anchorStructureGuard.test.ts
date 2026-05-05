import { describe, expect, it } from 'vitest';

import { shouldBlockAnchorTagMutation } from './anchorStructureGuard';

describe('anchorStructureGuard', () => {
  const content = 'AA<highlight id="1">BC</highlight id="1">DD';

  it('allows edits outside anchor tags', () => {
    expect(shouldBlockAnchorTagMutation(content, [{ from: 0, to: 1 }])).toBe(false);
  });

  it('allows edits inside anchor content range', () => {
    const contentStart = content.indexOf('BC');
    expect(shouldBlockAnchorTagMutation(content, [{ from: contentStart, to: contentStart + 1 }])).toBe(false);
  });

  it('blocks deletion that intersects open or close tags', () => {
    const openTagStart = content.indexOf('<highlight');
    const closeTagStart = content.indexOf('</highlight id="1">');
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagStart, to: openTagStart + 1 }])).toBe(true);
    expect(shouldBlockAnchorTagMutation(content, [{ from: closeTagStart, to: closeTagStart + 2 }])).toBe(true);
  });

  it('blocks insertion inside tag body but allows insertion at tag boundaries', () => {
    const openTagStart = content.indexOf('<highlight');
    const openTagEnd = content.indexOf('>') + 1;
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagStart + 1, to: openTagStart + 1 }])).toBe(true);
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagStart, to: openTagStart }])).toBe(false);
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagEnd, to: openTagEnd }])).toBe(false);
  });

  it('protects malformed anchor tags from being partially edited', () => {
    const malformed = '<highlight id="2">oops';
    const insideTag = malformed.indexOf('id=');
    expect(shouldBlockAnchorTagMutation(malformed, [{ from: insideTag, to: insideTag + 2 }])).toBe(true);
  });
});
