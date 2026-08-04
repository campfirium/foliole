// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { assertReleaseBodyPresentation } from './release-body-contract.mjs';

describe('release body presentation', () => {
  it('accepts reviewed public copy without internal scope metadata', () => {
    const body = 'Foliole is now available on Linux (Experimental).\n\n### New';
    expect(assertReleaseBodyPresentation(body)).toBe(body);
  });

  it('rejects empty copy and internal platform scope metadata', () => {
    expect(() => assertReleaseBodyPresentation('')).toThrow('must not be empty');
    expect(() => assertReleaseBodyPresentation('> Platforms: macOS, Windows')).toThrow('must not expose');
  });
});
