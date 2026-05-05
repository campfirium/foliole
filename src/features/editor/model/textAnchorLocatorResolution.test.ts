import { describe, expect, it } from 'vitest';

import { remapTextAnchorLocator, resolveTextAnchorLocatorSelection } from './textAnchorLocatorResolution';

describe('textAnchorLocatorResolution selection', () => {
  it('uses stored locator positions directly', () => {
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

  it('does not rematch by original text when the surrounding text changes', () => {
    expect(
      resolveTextAnchorLocatorSelection('Start Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 6,
      to: 10
    });
  });

  it('clamps locators that extend past the current content length', () => {
    expect(
      resolveTextAnchorLocatorSelection('Beta', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 4,
      to: 4
    });
  });
});

describe('textAnchorLocatorResolution remap', () => {
  it('keeps locator positions when there is no previous content context', () => {
    expect(
      remapTextAnchorLocator('Start Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 6,
      originalText: 'Beta',
      to: 10
    });
  });

  it('maps locators through parent content edits', () => {
    expect(
      remapTextAnchorLocator('Alpha Better Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      }, 'Alpha Beta Gamma')
    ).toEqual({
      from: 6,
      originalText: 'Better',
      to: 12
    });
  });

  it('falls back to a zero-width locator when the anchored range is fully deleted', () => {
    expect(
      remapTextAnchorLocator('Alpha  Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      }, 'Alpha Beta Gamma')
    ).toEqual({
      from: 6,
      originalText: 'Beta',
      to: 6
    });
  });

  it('clamps locators when the current content is shorter and there is no edit context', () => {
    expect(
      remapTextAnchorLocator('Beta', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 4,
      originalText: 'Beta',
      to: 4
    });
  });
});
