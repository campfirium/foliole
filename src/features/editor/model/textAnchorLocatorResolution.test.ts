import { describe, expect, it } from 'vitest';

import { remapTextAnchorLocator, resolveTextAnchorLocatorSelection } from './textAnchorLocatorResolution';

describe('textAnchorLocatorResolution selection', () => {
  it('keeps exact matching locator positions', () => {
    expect(
      resolveTextAnchorLocatorSelection('Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 6,
      to: 10
    });
  });

  it('recovers a stale locator when the original text exists in one unique place', () => {
    expect(
      resolveTextAnchorLocatorSelection('Start Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 'Start Alpha Beta Gamma'.indexOf('Beta'),
      to: 'Start Alpha Beta Gamma'.indexOf('Beta') + 'Beta'.length
    });
  });

  it('does not guess when the original text appears multiple times', () => {
    expect(
      resolveTextAnchorLocatorSelection('Beta Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toBeNull();
  });
});

describe('textAnchorLocatorResolution remap', () => {
  it('remaps locators with the same recovery rule', () => {
    expect(
      remapTextAnchorLocator('Start Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 'Start Alpha Beta Gamma'.indexOf('Beta'),
      originalText: 'Beta',
      to: 'Start Alpha Beta Gamma'.indexOf('Beta') + 'Beta'.length
    });
  });

  it('recovers an edited word near the stored offset when the text was expanded in place', () => {
    expect(
      remapTextAnchorLocator('Alpha Better Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 6,
      originalText: 'Better',
      to: 12
    });
  });

  it('falls back to an unresolved zero-width locator when the old text can no longer be proven', () => {
    expect(
      remapTextAnchorLocator('Alpha  Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 6,
      originalText: 'Beta',
      to: 6
    });
  });
});
