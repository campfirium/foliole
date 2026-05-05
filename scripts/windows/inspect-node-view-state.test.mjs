import { describe, expect, it } from 'vitest';

import { resolveTitle } from './inspect-node-view-state.mjs';

describe('inspect node view state script', () => {
  it('reads the first non-empty title argument', () => {
    expect(resolveTitle(['node', 'script', '', '  GTD 项目管理方法.md  '])).toBe('GTD 项目管理方法.md');
  });

  it('fails when no title argument is provided', () => {
    expect(() => resolveTitle(['node', 'script', ''])).toThrow('node title is required');
  });
});
