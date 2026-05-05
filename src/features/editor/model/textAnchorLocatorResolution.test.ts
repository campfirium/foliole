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

  it('keeps locators even when the current content is shorter', () => {
    expect(
      resolveTextAnchorLocatorSelection('Beta', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 6,
      to: 10
    });
  });
});

function registerBasicEditContextRemapTests() {
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
}

function registerBoundaryEditContextRemapTests() {
  it('keeps text inserted at the anchor start boundary outside the anchor', () => {
    expect(
      remapTextAnchorLocator('Alpha New Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      }, 'Alpha Beta Gamma')
    ).toEqual({
      from: 10,
      originalText: 'Beta',
      to: 14
    });
  });

  it('keeps text inserted at the anchor end boundary outside the anchor', () => {
    expect(
      remapTextAnchorLocator('Alpha Beta New Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      }, 'Alpha Beta Gamma')
    ).toEqual({
      from: 6,
      originalText: 'Beta',
      to: 10
    });
  });

  it('keeps text inserted inside the anchor within the anchor', () => {
    expect(
      remapTextAnchorLocator('Alpha BeXta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      }, 'Alpha Beta Gamma')
    ).toEqual({
      from: 6,
      originalText: 'BeXta',
      to: 11
    });
  });
}

describe('textAnchorLocatorResolution remap without edit context', () => {
  it('keeps stored locator offsets when there is no edit context', () => {
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

  it('keeps stored locator offsets when there is no edit context and the content is shorter', () => {
    expect(
      remapTextAnchorLocator('Beta', {
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
});

describe('textAnchorLocatorResolution remap with edit context', () => {
  registerBasicEditContextRemapTests();
  registerBoundaryEditContextRemapTests();
});
