import { describe, expect, it } from 'vitest';

import { buildFootnotePresentation } from './footnotePresentation';

describe('footnotePresentation', () => {
  it('builds resolved footnote display state', () => {
    expect(
      buildFootnotePresentation({ from: 0, to: 10, label: '1', note: 'Alpha note' })
    ).toEqual({
      ariaLabel: 'Footnote 1: Alpha note',
      hasTooltip: true,
      label: '1',
      note: 'Alpha note',
      status: 'resolved'
    });
  });

  it('builds unresolved footnote display state', () => {
    expect(
      buildFootnotePresentation({ from: 0, to: 4, label: '2', note: null })
    ).toEqual({
      ariaLabel: 'Footnote 2',
      hasTooltip: false,
      label: '2',
      note: null,
      status: 'unresolved'
    });
  });
});
