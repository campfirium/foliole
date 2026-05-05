import { describe, expect, it } from 'vitest';

import { CODE_FENCE_PATTERN, createLineClass } from './markdownLineSyntax';

describe('markdownLineSyntax', () => {
  it('recognizes code fences and common markdown line classes', () => {
    expect(CODE_FENCE_PATTERN.test('```ts')).toBe(true);
    expect(createLineClass('# Title', false)).toBe('cm-line-h1');
    expect(createLineClass('> Quote', false)).toBe('cm-line-quote');
    expect(createLineClass('- Item', false)).toBe('cm-line-list-unordered');
    expect(createLineClass('- [x] Item', false)).toBe('cm-line-list-unordered cm-line-task-list');
    expect(createLineClass('1. Item', false)).toBe('cm-line-list');
    expect(createLineClass('plain', true)).toBe('cm-line-code');
  });
});
