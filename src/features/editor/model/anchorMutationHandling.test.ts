import { describe, expect, it } from 'vitest';

import { resolveAnchorMutationDecision, shouldBlockAnchorTagMutation } from './anchorMutationHandling';

describe('anchorMutationHandling', () => {
  const content = 'AA<highlight id="1">BC</highlight id="1">DD';

  it('allows edits outside protected tags', () => {
    expect(shouldBlockAnchorTagMutation(content, [{ from: 0, to: 1 }])).toBe(false);
  });

  it('blocks edits that intersect protected tags', () => {
    const openTagStart = content.indexOf('<highlight');
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagStart, to: openTagStart + 1 }])).toBe(true);
  });

  it('rewrites boundary edits when the anchor content should survive', () => {
    const decision = resolveAnchorMutationDecision({
      changes: [{ from: 1, insert: '', to: content.indexOf('BC') + 1 }],
      content,
      nextContent: `${content.slice(0, 1)}${content.slice(content.indexOf('BC') + 1)}`,
      selection: { anchor: 1, head: 1 }
    });

    expect(decision).toEqual({
      content: 'A<highlight id="1">C</highlight id="1">DD',
      kind: 'rewrite',
      selection: { anchor: 1, head: 1 }
    });
  });
});
