import { describe, expect, it } from 'vitest';

import { buildCodeFenceCompletion, shouldAutoCloseCodeFence } from './markdownInputAssist';

describe('markdownInputAssist', () => {
  it('auto closes a code fence when typing the third backtick on an empty fence line', () => {
    expect(shouldAutoCloseCodeFence('``', 2, '`')).toBe(true);
  });

  it('does not auto close a code fence in the middle of text', () => {
    expect(shouldAutoCloseCodeFence('abc``', 5, '`')).toBe(false);
  });

  it('builds a fenced block and places cursor inside the block body', () => {
    const completion = buildCodeFenceCompletion('  ``');
    expect(completion.insertText).toBe('  ```\n\n  ```');
    expect(completion.selectionOffset).toBe(6);
  });
});
