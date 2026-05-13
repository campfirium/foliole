import { describe, expect, it } from 'vitest';

import { parseLiteralUnion } from './parseLiteralUnion';

const STRING_OPTIONS = ['light', 'dark'] as const;
const NUMBER_OPTIONS = [0, 1, 2] as const;

describe('parseLiteralUnion', () => {
  it('returns the matching literal with narrow type inference', () => {
    const parsed = parseLiteralUnion('light', STRING_OPTIONS);
    const typed: 'light' | 'dark' | null = parsed;

    expect(typed).toBe('light');
  });

  it('rejects invalid string, empty, null, undefined, and non-member primitive values', () => {
    expect(parseLiteralUnion('system', STRING_OPTIONS)).toBeNull();
    expect(parseLiteralUnion('', STRING_OPTIONS)).toBeNull();
    expect(parseLiteralUnion(null, STRING_OPTIONS)).toBeNull();
    expect(parseLiteralUnion(undefined, STRING_OPTIONS)).toBeNull();
    expect(parseLiteralUnion(1, STRING_OPTIONS)).toBeNull();
    expect(parseLiteralUnion(true, STRING_OPTIONS)).toBeNull();
  });

  it('uses strict case-sensitive matching', () => {
    expect(parseLiteralUnion('LIGHT', STRING_OPTIONS)).toBeNull();
    expect(parseLiteralUnion('Light', STRING_OPTIONS)).toBeNull();
  });

  it('supports numeric literal unions without clamping', () => {
    expect(parseLiteralUnion(1, NUMBER_OPTIONS)).toBe(1);
    expect(parseLiteralUnion(99, NUMBER_OPTIONS)).toBeNull();
    expect(parseLiteralUnion('1', NUMBER_OPTIONS)).toBeNull();
  });
});
