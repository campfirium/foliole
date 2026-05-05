import { describe, expect, it } from 'vitest';

import { computeSharedBlockImageMaxHeight } from './documentPanelBodyLayout';

describe('computeSharedBlockImageMaxHeight', () => {
  it('splits remaining height evenly across prompt and answer images when space is sufficient', () => {
    expect(
      computeSharedBlockImageMaxHeight({
        answerMetrics: { imageCount: 1, nonImageHeight: 80, viewportHeight: 400 },
        availableHeight: 820,
        promptMetrics: { imageCount: 1, nonImageHeight: 100, viewportHeight: 420 }
      })
    ).toBe(312);
  });

  it('keeps the shared image height at the base minimum when space is tight', () => {
    expect(
      computeSharedBlockImageMaxHeight({
        answerMetrics: { imageCount: 1, nonImageHeight: 170, viewportHeight: 190 },
        availableHeight: 560,
        promptMetrics: { imageCount: 1, nonImageHeight: 180, viewportHeight: 190 }
      })
    ).toBe(120);
  });

  it('uses the tighter editor when prompt and answer have different non-image heights', () => {
    expect(
      computeSharedBlockImageMaxHeight({
        answerMetrics: { imageCount: 1, nonImageHeight: 24, viewportHeight: 467 },
        availableHeight: 934,
        promptMetrics: { imageCount: 1, nonImageHeight: 60, viewportHeight: 467 }
      })
    ).toBe(399);
  });
});
