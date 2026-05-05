import { describe, expect, it } from 'vitest';

import { remapTextAnchorLocator } from '../features/editor/model/textAnchorLocatorResolution';

describe('workspaceTextAnchorLocatorSync remap', () => {
  it('keeps locator unchanged when the anchored text still matches in place', () => {
    expect(
      remapTextAnchorLocator('Alpha Beta Gamma', {
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

  it('keeps locator positions when content shifts without edit context', () => {
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

  it('keeps tracking edits that happen inside the anchored text itself', () => {
    expect(
      remapTextAnchorLocator(
        'Alpha Better Gamma',
        {
          from: 6,
          originalText: 'Beta',
          to: 10
        },
        'Alpha Beta Gamma'
      )
    ).toEqual({
      from: 6,
      originalText: 'Better',
      to: 12
    });
  });

  it('keeps locator positions when the same text appears multiple times and there is no edit context', () => {
    expect(
      remapTextAnchorLocator('Beta Alpha Beta Gamma', {
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
