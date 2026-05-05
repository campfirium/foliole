import { describe, expect, it } from 'vitest';

import { buildAnchorDecorationStatePlan, shouldRebuildAnchorDecorationState } from './anchorDecorationState';

describe('anchorDecorationState', () => {
  it('builds preview decoration state with sensitive ranges', () => {
    const state = buildAnchorDecorationStatePlan({
      content: '<highlight id="1">Alpha</highlight id="1">',
      displayMode: 'preview'
    });

    expect(state.plan.markRanges.some((range) => range.className === 'cm-md-highlight')).toBe(true);
    expect(state.sensitiveRanges.length).toBeGreaterThan(0);
  });

  it('rebuilds when a change touches sensitive ranges', () => {
    expect(
      shouldRebuildAnchorDecorationState({
        changes: [{ from: 1, to: 2 }],
        insertedTexts: [''],
        sensitiveRanges: [{ from: 0, to: 10 }]
      })
    ).toBe(true);
  });

  it('rebuilds when inserted text introduces anchor syntax', () => {
    expect(
      shouldRebuildAnchorDecorationState({
        changes: [{ from: 5, to: 5 }],
        insertedTexts: ['<highlight id="x">'],
        sensitiveRanges: []
      })
    ).toBe(true);
  });
});
