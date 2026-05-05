import { describe, expect, it } from 'vitest';

import { alignScrollTopToViewportRatio } from './scrollAlignment';

describe('alignScrollTopToViewportRatio', () => {
  it('moves cursor toward 40% viewport line', () => {
    const next = alignScrollTopToViewportRatio({
      currentScrollTop: 300,
      cursorViewportTop: 700,
      scrollHeight: 2000,
      viewportHeight: 500,
      viewportTop: 100
    });

    expect(next).toBe(700);
  });

  it('clamps to scroll bounds', () => {
    const next = alignScrollTopToViewportRatio({
      currentScrollTop: 200,
      cursorViewportTop: 80,
      scrollHeight: 700,
      viewportHeight: 500,
      viewportTop: 100
    });

    expect(next).toBe(0);
  });
});
