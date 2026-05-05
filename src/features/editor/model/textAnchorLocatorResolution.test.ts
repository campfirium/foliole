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

describe('textAnchorLocatorResolution remap with edit context', () => {
  it('keeps locator positions when there is no previous content context and the stored text still matches', () => {
    expect(
      remapTextAnchorLocator('Start Alpha Beta Gamma', {
        from: 12,
        originalText: 'Beta',
        to: 16
      })
    ).toEqual({
      from: 12,
      originalText: 'Beta',
      to: 16
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
});

describe('textAnchorLocatorResolution remap without edit context', () => {
  it('repositions locators by exact text when there is one unique match and no edit context', () => {
    expect(
      remapTextAnchorLocator('Start Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 12,
      originalText: 'Beta',
      to: 16
    });
  });

  it('falls back to a zero-width locator when there is no edit context and the text is gone', () => {
    expect(
      remapTextAnchorLocator('Beta', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 0,
      originalText: 'Beta',
      to: 4
    });
  });
});
