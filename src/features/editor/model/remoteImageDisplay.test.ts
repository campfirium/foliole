import { describe, expect, it } from 'vitest';

import { resolveImageDisplay } from './remoteImageDisplay';

describe('resolveImageDisplay', () => {
  it('uses intrinsic size only at the agreed small and large thresholds', () => {
    expect(resolveImageDisplay('block', { height: 64, width: 64 })).toBe('inline');
    expect(resolveImageDisplay('inline', { height: 240, width: 320 })).toBe('block');
    expect(resolveImageDisplay('inline', { height: 200, width: 200 })).toBe('inline');
    expect(resolveImageDisplay('block', { height: 200, width: 200 })).toBe('block');
  });

  it('preserves provisional layout for unknown size and explicit width', () => {
    expect(resolveImageDisplay('inline', null)).toBe('inline');
    expect(resolveImageDisplay('inline', { height: 900, width: 1200 }, 268)).toBe('inline');
  });
});
